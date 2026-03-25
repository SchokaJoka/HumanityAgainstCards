<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";

// VARIABLES
// ============================================================
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const route = useRoute();
const roomId = ref<string>("");
const playerId = ref<string>("");
const gameMasterId = ref<string | null>(null);

const roomCode = String(route.params.roomId ?? "").toUpperCase();

const players = useState<any[]>("players", () => []);
const gameChannel = useState<RealtimeChannel | null>("gameChannel", () => null);

const gameState = ref<{}>({});
const roundStatus = ref<string>("lobby");

const blackCard = ref<{}>({});
const myChosenWhiteCards = ref<any[]>([]);
const playerSubmissions = ref<any[]>([]);
const selectedPlayerSubmission = ref<any | null>(null);
const isWhiteCardsSubmitted = ref<boolean>(false);
const isSubmittingWhiteCards = ref<boolean>(false);
const isChoosingWinner = ref<boolean>(false);
const whiteCardPickError = ref<string>("");

const GAP_TOKEN: string = "[[W1tnYXBdXQ==]]";

const winnerUsername = ref<string>("");
const winnerUserId = ref<string>("");
const winnerCards = ref<[]>([]);

// ============================================================

// COMPOSABLES
// ============================================================
const { getCardCollections } = useCards();

const {
  // Variables
  isLeaving,
  gameStarted,
  playerHandCards,
  collectionCards,

  // Functions
  getRoomIdByCode,
  getRoomMetadata,
  insertPlayerInRoomTable,
  joinRoom,
  deletePlayerFromRoomTable,
  markMemberInactive,
  trackMyStatus,
  setupBroadcastListeners,
} = useRoom();

const {
  // Variables
  isStartingGame,
  isStartingNextRound,

  // Functions
  initializeGame,
  initializeNextRound,
  setGameMasterIfNotExists,
  getGameMasterId,
} = useGameManager();

const { getPlayerScore, updatePlayerScoreFromMember, syncPlayerScoresForRoom } =
  usePlayerScores();
// ============================================================

// COMPUTED PPROPERTIES
// ============================================================

const isGameMaster = computed(() => {
  return !!playerId.value && playerId.value === gameMasterId.value;
});

const czarId = computed(() => {
  if (gameStarted.value) {
    return gameState.value.czar_id ?? null;
  }
  return null;
});

const isCzar = computed(() => {
  return !!playerId.value && playerId.value === czarId.value;
});

const numberOfCardsToPlay = computed(() => {
  const card = blackCard.value as any;
  if (!card || card.number_of_gaps == null) return null;
  if (card.number_of_gaps === 0) return 1;
  return card.number_of_gaps;
});

const selectedHandCardIds = computed(() =>
  myChosenWhiteCards.value.map((c: any) => c.id),
);

const availableCollectionCards = computed(() => {
  if (Array.isArray(collectionCards.value?.data))
    return collectionCards.value.data;
  if (Array.isArray(collectionCards.value)) return collectionCards.value;
  return [];
});

type TextPart = {
  text: string;
  isGap: boolean;
  gapIndex?: number;
};

const getCardTextById = (cardId: string) => {
  const card = availableCollectionCards.value.find((c: any) => c.id === cardId);
  return card?.text || "Unknown card";
};

const getTextParts = (text: string): TextPart[] => {
  if (!text.includes(GAP_TOKEN)) {
    return [{ text, isGap: false }];
  }

  const textParts = text.split(GAP_TOKEN);
  const parts: TextPart[] = [];
  let gapIndex = 0;

  textParts.forEach((part: string, index: number) => {
    parts.push({ text: part, isGap: false });

    if (index < textParts.length - 1) {
      parts.push({ text: "", isGap: true, gapIndex });
      gapIndex += 1;
    }
  });

  return parts;
};

const blackCardTextParts = computed(() => {
  const text = blackCard.value.text || "";

  return getTextParts(text);
});

const myPresenceStatus = computed(() => {
  if (!gameStarted.value || roundStatus.value === "lobby") {
    return "waiting";
  }

  if (roundStatus.value === "round_start") {
    if (isCzar.value) return "czar";
    return isWhiteCardsSubmitted.value ? "submitted" : "choosing";
  }

  if (roundStatus.value === "round_submitted") {
    return isCzar.value ? "judging" : "waiting";
  }

  if (roundStatus.value === "round_end") {
    if (winnerUserId.value && winnerUserId.value === playerId.value)
      return "winner";
    return "round end";
  }

  return "playing";
});

watch(myPresenceStatus, async () => {
  await trackMyStatus(myPresenceStatus.value);
});

const round = computed(() => {
  if (!gameState.value.round) return null;
  return gameState.value.round;
});
// ============================================================

// Game State Handling
// ============================================================
async function handleGameStateChanges(currentMetaData: object) {
  gameState.value = currentMetaData;
  roundStatus.value = currentMetaData.round_status;

  switch (currentMetaData.round_status) {
    case "round_start":
      handleRoundStart(currentMetaData);
      break;
    case "round_submitted":
      handleRoundSubmitted(currentMetaData);
      break;
    case "round_end":
      handleRoundEnd(currentMetaData);
      break;
    default:
      console.warn("Unknown round status:", currentMetaData.round_status);
  }
}

async function handleRoundStart(currentMetaData: object) {
  gameState.value = currentMetaData;
  roundStatus.value = currentMetaData.round_status;
  winnerUserId.value = null;

  const { data, error } = await supabase
    .from("room_members")
    .select("status")
    .eq("room_id", roomId.value)
    .eq("user_id", playerId.value);

  if (error) {
    console.error("Error checking submission status:", error);
    return;
  }

  isWhiteCardsSubmitted.value = data[0].status === "submitted";
  blackCard.value = currentMetaData.black_card;
}

async function handleRoundSubmitted(currentMetaData: object) {
  gameState.value = currentMetaData;
  roundStatus.value = currentMetaData.round_status;
  winnerUserId.value = null;

  const { data, error } = await supabase
    .from("room_members")
    .select("*")
    .eq("room_id", roomId.value)
    .neq("user_id", czarId.value);

  const { error: error2 } = await supabase
    .from("room_members")
    .update({ status: "waiting" })
    .eq("room_id", roomId.value)
    .eq("user_id", playerId.value);

  if (error) {
    console.error("Error loading submitted white cards:", error);
    return;
  }

  if (error2) {
    console.error("Error updating player status to waiting:", error2);
    return;
  }

  isWhiteCardsSubmitted.value = false;
  blackCard.value = currentMetaData.black_card;

  playerSubmissions.value = data ?? [];
  console.log("submittedWhiteCards: ", playerSubmissions.value);
}

async function handleRoundEnd(currentMetaData: object) {
  const winnerId = currentMetaData.current_winner.user_id;
  winnerUserId.value = winnerId;
  blackCard.value = currentMetaData.black_card;
  winnerUsername.value =
    players.value.find((p) => p.user_id === winnerId)?.user_name || null;
  winnerCards.value =
    currentMetaData.current_winner.metadata?.submitted_cards || null;
}

async function startGame() {
  await initializeGame(roomId.value, dev2gaps.value);
}

async function startNexRound() {
  resetWinner();
  initializeNextRound(roomId.value);
}
// ============================================================

// Player Choose White Card Handling
// ============================================================
async function pickCard(card) {
  if (isCzar.value) return;

  whiteCardPickError.value = "";

  const idx = myChosenWhiteCards.value.findIndex((c) => c.id === card.id);
  if (idx === -1) {
    if (myChosenWhiteCards.value.length === numberOfCardsToPlay.value) {
      myChosenWhiteCards.value.shift(); // Remove the oldest played card from hand
      myChosenWhiteCards.value.push(card); // Add the new card to the end of the array

      return;
    }

    myChosenWhiteCards.value.push(card);
  } else {
    myChosenWhiteCards.value.splice(idx, 1);
  }
}

async function resetCards() {
  myChosenWhiteCards.value = [];
  whiteCardPickError.value = "";
}

async function submitCards() {
  if (myChosenWhiteCards.value.length === numberOfCardsToPlay.value) {
    if (isSubmittingWhiteCards.value) return;
    isSubmittingWhiteCards.value = true;

    try {
      const { data, error } = await supabase.functions.invoke(
        "submit_white_cards",
        {
          method: "POST",
          body: {
            czar_id: czarId.value,
            user_id: playerId.value,
            room_id: roomId.value,
            submitted_cards: myChosenWhiteCards.value,
          },
        },
      );
      if (error) {
        console.error("[EDGE] Error submitting white cards:", error);
      } else {
        const submittedIds = new Set(myChosenWhiteCards.value.map((c) => c.id));
        playerHandCards.value = playerHandCards.value.filter(
          (handCard) => !submittedIds.has(handCard.id),
        );
        console.log(
          "Updated playerHandCards after submission: ",
          playerHandCards.value,
        );
        myChosenWhiteCards.value = [];
        whiteCardPickError.value = "";

        isWhiteCardsSubmitted.value = true;

        console.log("[EDGE] success submit_white_cards", data);
      }
    } finally {
      isSubmittingWhiteCards.value = false;
    }
  } else {
    const required = Number(numberOfCardsToPlay.value ?? 0);
    const selected = myChosenWhiteCards.value.length;
    const remaining = Math.max(required - selected, 0);

    whiteCardPickError.value =
      remaining > 0
        ? `Pick ${remaining} more card(s).`
        : `${required} card(s) need to be submitted!`;

    console.warn(`${numberOfCardsToPlay.value} card(s) need to be submitted!`);
  }
}
// ============================================================

// Czar Choose Winner Handling
// ============================================================
async function pickWinner(playerSubmission: any) {
  if (!isCzar.value) return;
  selectedPlayerSubmission.value = playerSubmission;
}

async function resetWinner() {
  selectedPlayerSubmission.value = null;
}

async function submitWinner(winnerSubmission: any) {
  if (!isCzar.value) return;

  console.log("Selected winner: ", winnerSubmission);

  const { data, error } = await supabase.functions.invoke("select_winner", {
    method: "POST",
    body: {
      room_id: roomId.value,
      winner: winnerSubmission,
    },
  });

  if (error) {
    console.error("Error selecting winner:", error);
  } else {
    console.log("[EDGE] success select_winner", data);
  }
}
// ============================================================

// onMounted, onUnmounted
// ============================================================
onMounted(async () => {
  roomId.value = await getRoomIdByCode(roomCode);

  if (!roomId.value) {
    console.error("Missing room ID");
    return;
  }

  // Authentication
  if (user.value) {
    playerId.value = user.value.sub;
  } else {
    navigateTo("/login?redirect=joinGame&roomCode=" + roomCode);
    return;
  }

  if (!playerId.value) {
    console.error("Missing player ID");
    return;
  }

  // Load room metadata only after roomId is known
  const roomMetadata = await getRoomMetadata(roomId.value);
  console.log("Fetched roomMetadata on mount:", roomMetadata);

  gameMasterId.value = await setGameMasterIfNotExists(
    roomId.value,
    playerId.value,
  );
  console.log(
    "After setGameMaster - gameMasterId.value:",
    gameMasterId.value,
    "playerId:",
    playerId.value,
    "Match:",
    gameMasterId.value === playerId.value,
  );

  console.log(
    "Before setGameMaster, roomId:",
    roomId.value,
    "playerId:",
    playerId.value,
  );

  await insertPlayerInRoomTable(roomId.value, playerId.value);

  // JOIN REALTIME CHANNEL
  await joinRoom(roomCode, playerId.value);

  // Realtime socket listeners
  await setupBroadcastListeners(roomId.value, playerId.value);
  await syncPlayerScoresForRoom(roomId.value);

  // Realtime table listeners
  gameChannel.value?.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "rooms",
      filter: `id=eq.${roomId.value}`,
    },
    (payload) => {
      console.log("[POSTGRES CHANGES] rooms updated: ", payload);
      handleGameStateChanges(payload.new.metadata);
    },
  );

  gameChannel.value?.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "room_members",
      filter: `room_id=eq.${roomId.value}`,
    },
    (payload) => {
      console.log("[POSTGRES CHANGES] room_members updated: ", payload);
      updatePlayerScoreFromMember(payload.new);

      if (payload.new.status !== payload.old.status) {
        // status update
        // TO DO!
      }
    },
  );

  // Initialize realtime tracking
  gameChannel.value?.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await trackMyStatus(myPresenceStatus.value);
    }
  });

  // SYNC GAME STATE IF ALREADY STARTED
  const metadata = roomMetadata?.metadata;
  if (metadata?.round_status && metadata.round_status !== "lobby") {
    const { data: handCardsData } = await supabase
      .from("hand_cards")
      .select("*")
      .eq("room_id", roomId.value)
      .eq("user_id", playerId.value);

    playerHandCards.value = handCardsData ?? [];

    const { data: cardsData } = await supabase
      .from("cards")
      .select("*")
      .eq("collection_id", metadata.set_id);

    collectionCards.value = cardsData ?? [];

    await syncPlayerScoresForRoom(roomId.value);

    blackCard.value = metadata.black_card;
    gameStarted.value = true;
    handleGameStateChanges(metadata);
  }
});

onUnmounted(async () => {
  if (!isLeaving.value) await markMemberInactive(roomId.value, playerId.value);
  if (gameChannel.value) await supabase.removeChannel(gameChannel.value);
});
// ============================================================

// OTHER
// ============================================================
const canEditChosenGaps = computed(() => {
  return (
    !isCzar.value &&
    roundStatus.value === "round_start" &&
    !isWhiteCardsSubmitted.value
  );
});

const getWhiteCardTextAtGap = (gapIndex?: number) => {
  if (typeof gapIndex !== "number") return null;

  const chosenCard = myChosenWhiteCards.value[gapIndex];
  if (!chosenCard) return null;

  const chosenCardId = chosenCard.card_id ?? chosenCard.id;
  if (!chosenCardId) return null;

  const cardText = availableCollectionCards.value.find(
    (c: any) => c.id === chosenCardId,
  )?.text;

  return typeof cardText === "string" ? cardText : null;
};

const deleteWhiteCardAtGap = (gapIndex?: number) => {
  if (!canEditChosenGaps.value || !gapIndex) return;
  if (gapIndex >= myChosenWhiteCards.value.length) return;
  myChosenWhiteCards.value.splice(gapIndex, 1);
};
// ============================================================

// DEV DEBUGGING
// ============================================================
const dev2gaps = ref(false);
// ============================================================
</script>

<template>
  <main class="flex flex-col items-center min-h-screen scroll-x- pt-48">
    <!-- Lobby Info Section -->
    <section
      class="z-10 shadow-xs shadow-white fixed top-0 left-0 pb-2 w-full bg-white pt-[env(safe-area-inset-top),1.5rem)]"
    >
      <div class="flex items-start justify-between h-fit p-4">
        <div class="">
          <h1 class="text-2xl font-bold">Room: {{ roomCode }}</h1>
          <!-- <p class="text-sm text-gray-500">
            {{ players.length }} players online
          </p> -->
          <!-- <p class="text-sm text-blue-500">({{ roundStatus }})</p> -->
          <p v-if="round" class="text-sm text-blue-500">{{ round }}. Round</p>
        </div>
        <div class="flex gap-2">
          <button
            @click="deletePlayerFromRoomTable(roomId, playerId)"
            class="px-6 py-4 rounded-full text-gray-500 border border-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50"
          >
            Leave
          </button>
        </div>
      </div>
    </section>
    <!-- Player List -->
    <div class="flex flex-row px-4 overflow-x-auto gap-2">
      <div
        v-for="player in players"
        :key="player.user_id"
        class="flex flex-col items-start justify-between gap-2 min-w-32 rounded-xl p-2 text-xs font-medium border transition-all"
        :class="
          czarId === player.user_id
            ? 'border-yellow-100 bg-yellow-100 text-yellow-700'
            : player.status === 'submitted'
              ? 'border-green-50 bg-green-50 text-green-200'
              : 'border-gray-50 bg-gray-50 text-gray-600'
        "
      >
        <div
          class="w-full flex flex-row items-center justify-start gap-1 transition"
        >
          <span class="text-md font-bold transition">{{
            player.user_name
          }}</span>
          <span
            v-if="player.user_id === playerId"
            class="text-md font-normal transition"
            >(you)</span
          >
        </div>
        <div
          class="w-full flex flex-row items-center justify-between gap-2 transition"
        >
          <span class="">{{ getPlayerScore(player.user_id) }}</span>
          <span class="text-[0.6rem] uppercase transition">{{
            player.status
          }}</span>
        </div>
      </div>
    </div>
    <!-- Waiting for game to start -->
    <section
      v-if="!isGameMaster && !gameStarted"
      class="bg-white rounded w-full max-w-2xl p-12 flex flex-col items-center justify-center"
    >
      <p class="text-blue-500">Waiting for the Game Master to start...</p>
    </section>

    <!-- Start Game Button -->
    <section
      v-if="!gameStarted && isGameMaster"
      class="fixed bottom-[max(env(safe-area-inset-top),1.5rem)] flex items-center transition-all"
    >
      <button
        @click="startGame()"
        :disabled="isStartingGame"
        class="px-8 py-4 bg-blue-500 rounded-full text-white text-sm font-semibold rounded hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {{ isStartingGame ? "Starting..." : "Start Game" }}
      </button>
    </section>

    <p
      v-if="
        whiteCardPickError &&
        !isCzar &&
        roundStatus === 'round_start' &&
        !isWhiteCardsSubmitted
      "
      class="text-red-500 text-sm mb-2"
    >
      {{ whiteCardPickError }}
    </p>
  </main>
</template>
