<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";

// VARIABLES
// ============================================================
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const route = useRoute();
const roomId = ref<string>("");
const playerId = ref<string>("");

const roomCode = ref<string>("");

const players = useState<any[]>("players", () => []);
const gameChannel = useState<RealtimeChannel | null>("gameChannel", () => null);
const isGameMaster = useState<boolean>("isGameMaster", () => false);

const myChosenWhiteCards = useState<any[]>("myChosenWhiteCards", () => []);
const selectedPlayerSubmission = ref<any | null>(null);
const isWhiteCardsSubmitted = useState<boolean>("isWhiteCardsSubmitted", () => false);
const isSubmittingWhiteCards = ref<boolean>(false);
const isChoosingWinner = ref<boolean>(false);
const whiteCardPickError = ref<string>("");

const gameStarted = useState<boolean>("gameStarted", () => false);

const GAP_TOKEN: string = "[[W1tnYXBdXQ==]]";

// ============================================================

// COMPOSABLES
// ============================================================
const { getCardCollections } = useCards();

const {
  // Variables
  isLeaving,
  playerHandCards,
  collectionCards,
  gameMasterId,

  // Functions
  getRoomIdByCode,
  getRoomMetadata,
  enterRoom,
  deletePlayerFromRoomTable,
  markMemberInactive,
  trackMyStatus,
  setupBroadcastListeners,
  leaveRoomRealtime,
} = useRoom();

const {
  // Variables
  isStartingGame,
  isStartingNextRound,
  gameState,
  roundStatus,
  blackCard,
  playerSubmissions,
  winnerUserId,
  winnerUsername,
  winnerCards,
  gameManagerRoomId,
  gameManagerPlayerId,

  // Functions
  initializeGame,
  initializeNextRound,
  // getGameMasterId,
  handleGameStateChanges,
} = useGameManager();

const { getPlayerScore, updatePlayerScoreFromMember, syncPlayerScoresForRoom } = usePlayerScores();
// ============================================================

// COMPUTED PPROPERTIES
// ============================================================

watch(gameStarted, async () => {
  console.log("gameStarted changed: ", gameStarted.value);
});

watch(roundStatus, async (newStatus) => {
  if (newStatus === "round_start" && roomId.value && playerId.value) {
    // Load hand cards when round starts
    const { data: handCardsData, error: handError } = await supabase
      .from("hand_cards")
      .select("*")
      .eq("room_id", roomId.value)
      .eq("user_id", playerId.value);

    if (handError) {
      console.error("Error fetching hand cards:", handError);
    } else {
      playerHandCards.value = (handCardsData ?? []).map((h) => ({
        ...h,
        card_id: h.card_id ?? "",
      }));
    }

    // Load collection cards if not already loaded
    if (collectionCards.value.length === 0 && gameState.value?.set_id) {
      const { data: cardsData, error: cardsError } = await supabase
        .from("cards")
        .select("*")
        .eq("collection_id", gameState.value.set_id);

      if (cardsError) {
        console.error("Error fetching collection cards:", cardsError);
      } else {
        collectionCards.value = cardsData ?? [];
      }
    }
  }
});


const czarId = computed(() => {
  if (!gameStarted.value) return null;
  return gameState.value?.czar_id ?? null;
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

type TextPart = {
  text: string;
  isGap: boolean;
  gapIndex?: number;
};

const getCardTextById = (cardId: string) => {
  const card = collectionCards.value.find((c: any) => c.id === cardId);
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
  const text = blackCard.value?.text || "";
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
  if (!gameState.value?.round) return null;
  return gameState.value.round;
});
// ============================================================

// Player Choose White Card Handling
// ============================================================
async function pickCard(card: any) {
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
const isNavigatingWithinRoom = ref(false);

onMounted(async () => {
  roomCode.value = String(route.params.roomCode ?? "").toUpperCase();

  roomId.value = await getRoomIdByCode(roomCode.value);

  if (!roomId.value) {
    console.error("Missing room ID");
    return;
  }

  // Set the gameManager's roomId
  gameManagerRoomId.value = roomId.value;

  // Load room metadata only after roomId is known
  const roomMetadata = await getRoomMetadata(roomId.value);

  // Authentication
  if (user.value) {
    playerId.value = user.value.sub;
  } else {
    navigateTo("/login?redirect=joinGame&roomCode=" + roomCode.value);
    return;
  }

  if (!playerId.value) {
    console.error("Missing player ID");
    return;
  }

  // Set the gameManager's playerId
  gameManagerPlayerId.value = playerId.value;

  const { data: room } = await supabase
    .from("rooms")
    .select("owner")
    .eq("id", roomId.value)
    .single();
  gameMasterId.value = room?.owner ?? null;

  await syncPlayerScoresForRoom(roomId.value);

  if (gameChannel.value) {
    console.log("gameChannel exists:", gameChannel.value);
  } else {
    console.warn("gameChannel not exists, rejoining");
    enterRoom(roomId.value, roomCode.value, playerId.value, "waiting");
  }

  // // Realtime table listeners (after channel is created)
  // gameChannel.value?.on(
  //   "postgres_changes",
  //   {
  //     event: "UPDATE",
  //     schema: "public",
  //     table: "rooms",
  //     filter: `id=eq.${roomId.value}`,
  //   },
  //   (payload) => {
  //     console.log("[POSTGRES CHANGES] rooms updated: ", payload);
  //     if (payload.new.owner) {
  //       gameMasterId.value = payload.new.owner;
  //     }

  //     const metadata = payload.new.metadata as any;
  //     if (metadata) handleGameStateChanges(metadata);
  //   },
  // );

  // gameChannel.value?.subscribe(async (status) => {
  //   if (status === "SUBSCRIBED") {
  //     await trackMyStatus(myPresenceStatus.value);
  //   }
  // });

  // STEP 2: Conditionally load game state if game already started
  const metadata = (roomMetadata?.metadata ?? null) as any;
  if (metadata) {
    if (metadata.round_status !== "lobby") {
      console.log("Game already in progress, loading game state...");

      const { data: handCardsData, error } = await supabase
        .from("hand_cards")
        .select("*")
        .eq("room_id", roomId.value)
        .eq("user_id", playerId.value);


      if (error) {
        console.error("Error fetching hand cards:", error);
      }

      console.log("playerHandCards: ", handCardsData);

      playerHandCards.value = (handCardsData ?? []).map((h: any) => ({
        ...h,
        card_id: h.card_id ?? "",
      }));

      if (metadata.set_id) {
        const { data: cardsData } = await supabase
          .from("cards")
          .select("*")
          .eq("collection_id", metadata.set_id);

        collectionCards.value = cardsData ?? [];
      }

      await syncPlayerScoresForRoom(roomId.value);

      blackCard.value = metadata.black_card ?? null;
    }
    console.log("Initial game state loaded: ", metadata);
    await handleGameStateChanges(metadata);
  }

  console.log("Initial gameStarted: ", gameStarted.value);
});

onBeforeRouteLeave((to) => {
  // If moving within the same room flow, preserve the channel
  if (to.params.roomCode === route.params.roomCode) {
    isNavigatingWithinRoom.value = true;
  }
});

onUnmounted(async () => {
  if (!isLeaving.value && roomId.value && playerId.value) {
    await markMemberInactive(roomId.value, playerId.value);
  }
  
  if (!isNavigatingWithinRoom.value) {
    await leaveRoomRealtime();
  }
});
// ============================================================

// OTHER
// ============================================================

async function startNexRound() {
  initializeNextRound(roomId.value);
}

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

  const cardText = collectionCards.value.find(
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
  <main class="flex flex-col items-center w-full min-h-svh">
    <!-- Lobby Info Section -->
    <section
      class="z-10 shadow-xs shadow-white fixed top-0 left-0 pb-2 w-full bg-white pt-[env(safe-area-inset-top),1.5rem)]">
      <div class="flex items-start justify-between h-fit p-4">
        <div class="">
          <h1 class="text-2xl font-bold">Room: {{ roomCode }}</h1>
          <!-- <p class="text-sm text-gray-500">
            {{ players.length }} players online
          </p> -->
          <!-- <p class="text-sm text-red-500">({{ roundStatus }})</p> -->
          <p v-if="round" class="text-sm text-red-500">{{ round }}. Round</p>
        </div>
        <div class="flex gap-2">
          <button @click="deletePlayerFromRoomTable(roomId, playerId)"
            class="px-6 py-4 rounded-full text-gray-500 border border-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50">
            Leave
          </button>
        </div>
      </div>

      <!-- Player List -->
      <div class="flex flex-row px-4 overflow-x-auto gap-2">
        <div v-for="player in players" :key="player.user_id"
          class="flex flex-col items-start justify-between gap-2 min-w-32 rounded-xl p-2 text-xs font-medium border transition-all"
          :class="czarId === player.user_id
            ? 'border-yellow-100 bg-yellow-100 text-yellow-700'
            : player.status === 'submitted'
              ? 'border-green-50 bg-green-50 text-green-200'
              : 'border-gray-50 bg-gray-50 text-gray-600'
            ">
          <div class="w-full flex flex-row items-center justify-start gap-1 transition">
            <span class="text-md font-bold transition">{{
              player.user_name
            }}</span>
            <span v-if="player.user_id === playerId" class="text-md font-normal transition">(you)</span>
          </div>
          <div class="w-full flex flex-row items-center justify-between gap-2 transition">
            <span class="">{{ getPlayerScore(player.user_id) }}</span>
            <span class="text-[0.6rem] uppercase transition">{{
              player.status
            }}</span>
          </div>
        </div>
      </div>
    </section>

    <p v-if="
      whiteCardPickError &&
      !isCzar &&
      roundStatus === 'round_start' &&
      !isWhiteCardsSubmitted
    " class="text-red-500 text-sm mb-2">
      {{ whiteCardPickError }}
    </p>

    <!-- Game Area -->
    <section v-if="gameStarted" class="relative flex flex-col items-center justify-start h-full w-full max-w-2xl gap-4">
      <!-- Status Message -->
      <p class="bg-white p-2 text-red-500 text-2xl text-center">
        <span v-if="roundStatus === 'round_start'" class="font-medium">
          {{
            isCzar
              ? "Waiting for players to pick..."
              : isWhiteCardsSubmitted
                ? "Waiting for others..."
                : "Pick a white card!"
          }}
        </span>
        <span v-if="roundStatus === 'round_submitted'" class="font-medium">
          {{ isCzar ? "Pick the winner!" : "The Czar is judging..." }}
        </span>
      </p>

      <!-- Black Card -->
      <div class="flex flex-col items-center justify-center gap-4">
        <div v-if="roundStatus === 'round_end'" class="space-y-3">
          <p class="text-2xl font-medium text-red-700">
            {{
              winnerUsername
                ? `${winnerUsername} wins the round!`
                : "Couldn't determine winner."
            }}
          </p>
        </div>
        <div v-if="blackCard"
          class="relative h-64 w-52 rounded-lg bg-gray-900 p-6 text-lg font-bold text-white shadow-md">
          <div>
            <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`">
              <span v-if="part.isGap" @click="deleteWhiteCardAtGap(part.gapIndex)"
                :title="getWhiteCardTextAtGap(part.gapIndex) || '•••'"
                class="mx-1 inline-flex h-8 w-24 min-w-24 items-center justify-center overflow-hidden rounded-md border border-white/40 bg-white/10 px-3 py-1 align-middle text-sm font-semibold text-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                :class="[
                  canEditChosenGaps && getWhiteCardTextAtGap(part.gapIndex)
                    ? 'cursor-pointer hover:border-white/70 hover:bg-white/20'
                    : 'cursor-default',
                  getWhiteCardTextAtGap(part.gapIndex)
                    ? 'tracking-normal'
                    : 'tracking-[0.35em] text-white/80',
                ]">
                <span class="block w-full truncate text-center">
                  {{ getWhiteCardTextAtGap(part.gapIndex) || "•••" }}
                </span>
              </span>
              <span v-else>{{ part.text }}</span>
            </span>
          </div>
        </div>
        <div v-if="roundStatus === 'round_end'" class="w-full p-4">
          <div class="flex flex-row items-center justify-start gap-4 bg-gray-100 p-4 rounded-lg transition-all">
            <div v-for="(cardId, index) in winnerCards" :key="index"
              class="relative w-full min-h-48 max-w-36 rounded-lg shadow-lg bg-white p-3 font-medium text-sm transition-all">
              {{ getCardTextById(cardId) }}
              <div class="absolute bottom-2 right-3 text-xs text-red-500">
                {{ winnerUsername }}
              </div>
              <div class="absolute bottom-2 left-3 text-xs text-gray-400">
                {{ index + 1 }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Judging Area -->
      <div v-if="roundStatus === 'round_submitted'"
        class="mx-1 overflow-x-auto overflow-y-visible px-1 pb-3 pt-1 [scrollbar-width:thin]">
        <div class="flex w-max min-w-full flex-nowrap gap-4 snap-x snap-mandatory">
          <template v-for="playerSubmission in playerSubmissions" :key="`${playerSubmission.id}`">
            <div v-for="cardId in playerSubmission.metadata?.submitted_cards || []"
              :key="`${playerSubmission.id}-${cardId}`" @click="isCzar && pickWinner(playerSubmission)"
              class="h-64 w-52 shrink-0 snap-start rounded-lg border border-gray-200 bg-white p-4 text-sm font-bold text-gray-800 shadow-sm transition-all"
              :class="[
                isCzar
                  ? 'cursor-pointer md:hover:-translate-y-1 md:hover:border-red-300 md:hover:shadow-lg'
                  : 'cursor-default',
                selectedPlayerSubmission?.user_id === playerSubmission.user_id
                  ? 'border-red-400 bg-red-50 ring-2 ring-red-200'
                  : 'bg-white',
              ]">
              {{ getCardTextById(cardId) }}
            </div>
          </template>
        </div>
      </div>

      <!-- Player Hand -->
      <div v-if="
        !isCzar &&
        roundStatus === 'round_start' &&
        isWhiteCardsSubmitted === false
      " class="w-full">
        <MyCarousel :hand-cards="playerHandCards" :collection-cards="collectionCards"
          :selected-card-ids="selectedHandCardIds" @select-card="pickCard" />
      </div>
    </section>

    <section v-if="gameStarted && isCzar && roundStatus === 'round_submitted'"
      class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] flex flex-col items-center gap-2 transition-all">
      <button @click="submitWinner(selectedPlayerSubmission)" :disabled="isChoosingWinner"
        class="px-8 py-4 bg-red-500 rounded-full text-white text-sm font-semibold rounded hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70">
        {{ isChoosingWinner ? "Choosing..." : "Choose" }}
      </button>
    </section>

    <!-- Submit Button -->
    <section v-if="
      gameStarted &&
      !isCzar &&
      roundStatus === 'round_start' &&
      !isWhiteCardsSubmitted
    " class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] flex items-center transition-all">
      <button @click="submitCards()" :disabled="isSubmittingWhiteCards ||
        myChosenWhiteCards.length !== numberOfCardsToPlay
        "
        class="px-8 py-4 bg-red-500 rounded-full text-white text-sm font-semibold rounded hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70">
        {{
          isSubmittingWhiteCards
            ? "Submitting..."
            : myChosenWhiteCards.length === numberOfCardsToPlay
              ? "Submit"
              : `${myChosenWhiteCards.length} / ${numberOfCardsToPlay} Cards`
        }}
      </button>
    </section>

    <!-- Next Round Button -->
    <section v-if="roundStatus === 'round_end' && isCzar"
      class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] flex items-center transition-all">
      <button @click="startNexRound()" :disabled="isStartingNextRound"
        class="px-8 py-4 bg-red-500 rounded-full text-white text-sm font-semibold rounded hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70">
        {{ isStartingNextRound ? "Loading..." : "Next Round" }}
      </button>
    </section>

    <section v-if="isGameMaster" class="fixed bottom-4 right-4 p-4 bg-gray-300 rounded-full"
      :class="roundStatus !== 'lobby' ? 'opacity-50' : ''">
      <div class="flex flex-row gap-4">
        <input v-model="dev2gaps" type="checkbox" id="dev-2-gaps" name="horns" :disabled="roundStatus !== 'lobby'" />
        <label for="horns">dev-2-gaps</label>
      </div>
    </section>
  </main>
</template>
