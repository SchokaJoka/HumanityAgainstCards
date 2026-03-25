<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";

// VARIABLES
// ============================================================
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const route = useRoute();
const roomId = ref<string>("");
const playerId = ref<string>("");
const gameMasterId = useState<string>("gameMasterId", () => "");
const isGameMaster = useState<boolean>("isGameMaster", () => false);

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
  // setGameMasterIfNotExists,
  // getGameMasterId,
} = useGameManager();

const { getPlayerScore, updatePlayerScoreFromMember, syncPlayerScoresForRoom } =
  usePlayerScores();
// ============================================================

// COMPUTED PPROPERTIES
// ============================================================

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

// Watch for changes to playerId or gameMasterId and update isGameMaster
watch([playerId, gameMasterId], ([newPlayerId, newGameMasterId]) => {
  isGameMaster.value = !!newPlayerId && newPlayerId === newGameMasterId;
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

// onMounted, onUnmounted
// ============================================================
onMounted(async () => {
  try {
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

    const { data: room } = await supabase
      .from("rooms")
      .select("owner")
      .eq("id", roomId.value)
      .single();
    gameMasterId.value = room?.owner ?? null;
    console.log("Game master ID from DB:", gameMasterId.value);

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
        if (payload.new.owner) {
          gameMasterId.value = payload.new.owner;
        }
        if (payload.new.metadata && typeof payload.new.metadata === "object") {
          handleGameStateChanges(payload.new.metadata);
        }
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
    const roomMetadata = await getRoomMetadata(roomId.value);
    const metadata = roomMetadata?.metadata;

    if (
      metadata &&
      typeof metadata === "object" &&
      metadata.round_status &&
      metadata.round_status !== "lobby"
    ) {
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
      handleGameStateChanges(metadata as object);
    }
  } catch (err) {
    console.error("[onMounted] Error:", err);
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

const isRoomCodeCopied = ref<boolean>(false);

async function copyRoomCode() {
  navigator.clipboard
    .writeText(roomCode)
    .then(() => {
      isRoomCodeCopied.value = true;
    })
    .catch((err) => {
      console.error("Failed to copy room code: ", err);
    });
}


// DEV DEBUGGING
// ============================================================
const dev2gaps = ref(false);
// ============================================================
</script>

<template>

  <!-- Header -->
  <header class="fixed top-0 w-full flex items-center justify-start p-4 bg-white z-40">
    <div class="cursor-pointer" @click="deletePlayerFromRoomTable(roomId, playerId)">
      <svg xmlns="http://www.w3.org/2000/svg" width="38" height="33" viewBox="0 0 38 33" fill="none">
        <path
          d="M37 31.8505C32.596 26.4042 28.6852 23.314 25.2676 22.5797C21.85 21.8454 18.5962 21.7345 15.5062 22.2469V32L1 16.0852L15.5062 1.00003V10.2699C21.22 10.3155 26.0776 12.3922 30.079 16.5C34.0798 20.6078 36.3868 25.7247 37 31.8505Z"
          stroke="black" stroke-width="2" stroke-linejoin="round" />
      </svg>
    </div>
  </header>

  <!-- Main Content -->
  <main class="relative flex flex-col items-center justify-start min-h-svh w-full max-w-2xl px-8 pb-8 pt-4 gap-4">
    <div class="h-[33px] w-full mb-4"></div>
    <p class="text-black text-4xl font-normal">Create Game</p>

    <!-- Game Mode Selection -->
    <div
      class="w-full bg-neutral-200 rounded-lg text-black flex flex-row items-stretch justify-between p-5 hover:bg-neutral-300 cursor-pointer">
      <div class="flex flex-col gap-1 w-full">
        <p class="text-3xl font-semibold">Classic</p>
        <p class="text-sm font-normal">The epic game just as you know it.</p>
      </div>
      <div class="flex justify-center items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="23" viewBox="0 0 12 23" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd"
            d="M8.14441 11.2896L1.49204 4.63721L2.82233 3.30692L10.1398 10.6244C10.3162 10.8009 10.4153 11.0401 10.4153 11.2896C10.4153 11.539 10.3162 11.7783 10.1398 11.9547L2.82233 19.2722L1.49204 17.9419L8.14441 11.2896Z"
            fill="black" />
        </svg>
      </div>
    </div>
    <div
      class="w-full bg-neutral-200 rounded-lg text-black flex flex-row items-stretch justify-between p-5 hover:bg-neutral-300 cursor-pointer">
      <div class="flex flex-col gap-1 w-full">
        <p class="text-3xl font-semibold">Extended</p>
        <p class="text-sm font-normal">Spice up your usual game with some jokers.</p>
      </div>
      <div class="flex justify-center items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="23" viewBox="0 0 12 23" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd"
            d="M8.14441 11.2896L1.49204 4.63721L2.82233 3.30692L10.1398 10.6244C10.3162 10.8009 10.4153 11.0401 10.4153 11.2896C10.4153 11.539 10.3162 11.7783 10.1398 11.9547L2.82233 19.2722L1.49204 17.9419L8.14441 11.2896Z"
            fill="black" />
        </svg>
      </div>
    </div>
    <div
      class="w-full bg-neutral-200 rounded-lg text-black flex flex-row items-stretch justify-between p-5 hover:bg-neutral-300 cursor-pointer">
      <div class="flex flex-col gap-1 w-full">
        <p class="text-3xl font-semibold">Creative Mode</p>
        <p class="text-sm font-normal">Write ALL your own cards. Yes, even the black ones.</p>
      </div>
      <div class="flex justify-center items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="23" viewBox="0 0 12 23" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd"
            d="M8.14441 11.2896L1.49204 4.63721L2.82233 3.30692L10.1398 10.6244C10.3162 10.8009 10.4153 11.0401 10.4153 11.2896C10.4153 11.539 10.3162 11.7783 10.1398 11.9547L2.82233 19.2722L1.49204 17.9419L8.14441 11.2896Z"
            fill="black" />
        </svg>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <!-- Player List, Room Info -->
  <main
    class="fixed bottom-[max(env(safe-area-inset-top),1rem)] flex flex-col items-center justify-between min-h-lg w-full max-w-2xl px-8 pb-8 pt-4 gap-4">
    <!-- Player List -->
    <section class="flex flex-row w-full overflow-x-auto gap-4">
      <div v-for="player in players" :key="player.user_id" class="flex flex-col gap-2 items-center transition-all"
        :class="czarId === player.user_id
          ? 'border-yellow-100 text-yellow-700'
          : player.status === 'submitted'
            ? 'border-green-50 text-green-200'
            : 'border-black text-black'
          ">
        <div class="size-12 rounded-full border-[3px] border-current bg-gray-500"></div>
        <p class="text-xs">{{ player.user_name }}</p>
      </div>
    </section>

    <!-- Start Game Button -->
    <section v-if="!gameStarted" class="flex flew-row items-stretch w-full transition-all justify-between gap-4">
      <div class="flex flex-col gap-2 w-full">
        <div
          class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black">
          <div class="w-full flex flex-row items-center justify-between cursor-pointer hover:text-blue-500">
            <div class="w-full py-4 px-4 text-xl font-normal">
              {{ roomCode.trim().toUpperCase() }}
            </div>
            <div @click="copyRoomCode()" class="flex items-center px-4 h-full bg-neutral-200 h-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M18.4903 3.46692H4.62256V18.4903" stroke="black" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" />
                <path
                  d="M9.24512 8.08948H23.1128V21.9572C23.1128 22.5702 22.8693 23.1581 22.4359 23.5915C22.0024 24.025 21.4145 24.2685 20.8015 24.2685H11.5564C10.9434 24.2685 10.3555 24.025 9.92208 23.5915C9.48863 23.1581 9.24512 22.5702 9.24512 21.9572V8.08948Z"
                  stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <Button v-if="isGameMaster" @click="startGame()" variant="primary" size="md" class="rounded-xl">Start</Button>
    </section>
  </main>
</template>
