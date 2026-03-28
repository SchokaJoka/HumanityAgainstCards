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
const { headerEl } = useHeaderHeight();
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

const judgingCards = computed(() => {
  return playerSubmissions.value.flatMap(ps =>
    (ps.metadata?.submitted_cards || []).map((cardId: string) => ({
      id: `${ps.id}-${cardId}`,
      card_id: cardId,
      submission: ps
    }))
  );
});

const selectedJudgingCardIds = computed(() => {
  if (!selectedPlayerSubmission.value) return [];
  return (selectedPlayerSubmission.value.metadata?.submitted_cards || []).map((cardId: string) =>
    `${selectedPlayerSubmission.value.id}-${cardId}`
  );
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
async function pickWinner(item: any) {
  if (!isCzar.value) return;
  selectedPlayerSubmission.value = item.submission;
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

const roundStatusMessage = computed(() => {
  switch (roundStatus.value) {
    case "lobby":
      return "Waiting for players...";
    case "round_start":
      return isCzar.value
        ? "Wait for players to submit..."
        : "Pick your white card(s)!";
    case "round_submitted":
      return isCzar.value
        ? "Pick the winner!"
        : "Waiting for Czar...";
    case "round_end":
      return winnerUsername.value
        ? `${winnerUsername.value.toUpperCase()} won the round!`
        : "Round ended. Waiting for next round...";
    default:
      return "";
  }
});

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
  <main class="flex flex-col items-center w-full min-h-dvh">
    <header ref="headerEl" class="fixed pt-[env(safe-area-inset-top),0px)] w-full flex flex-col p-4 gap-2 z-40">
      <div class="w-full flex flex-row items-stretch justify-between gap-2">
        <div class="flex flex-row w-full items-center justify-start overflow-x-auto gap-2">
          <div v-for="player in players" :key="player.user_id" class="flex flex-col items-center gap-1">
            <div class="flex items-center justify-center size-12 rounded-full border-2 transition-all" :class="czarId === player.user_id
              ? 'border-yellow-300'
              : player.status === 'submitted'
                ? 'border-green-300'
                : 'border-black'
              ">
              <img src="https://placehold.co/40" alt="Player avatar" class="size-10 rounded-full object-cover" />

            </div>
            <span class="text-xs font-semibold transition">{{ player.user_id === playerId ? 'You' : player.user_name
              }}</span>
          </div>
        </div>
        <Button @click="deletePlayerFromRoomTable(roomId, playerId)" variant="primary" size="md"
          class="rounded-xl">Leave</Button>
      </div>
      <div class="w-full flex flex-row gap-2">
        <div class="w-full text-center font-medium text-md">
          {{ roundStatusMessage }}
        </div>
      </div>
    </header>

    <!-- Game Section -->
    <section name="game-section" v-if="gameStarted"
      class="w-full mt-[var(--sets-header-h)] h-[calc(100dvh-var(--sets-header-h))] flex items-center gap-4 overflow-y-visible py-4"
      :class="isCzar ? 'flex-col-reverse justify-start' : 'flex-col justify-start'">
      <TransitionGroup name="fade" mode="out-in">
        <!-- Black Card -->
        <div v-if="blackCard"
          class="w-full max-h-[40dvh] max-w-[55dvw] min-w-[16rem] md:max-w-md h-96 rounded-xl bg-black p-6 pb-12 text-lg font-bold text-white">
          <div class="">
            <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
              :class="part.isGap ? 'm-1 p-2 bg-white text-black rounded-md cursor-pointer' : ''"
              @click="deleteWhiteCardAtGap(part.gapIndex)">
              {{ part.isGap ? getWhiteCardTextAtGap(part.gapIndex) || "___" : part.text }}
            </span>
          </div>
        </div>

        <!-- Player Hand -->
        <div v-if="!isCzar && roundStatus === 'round_start' && isWhiteCardsSubmitted === false"
          class="w-full h-full overflow-y-clip z-10">
          <MyCarousel :items="playerHandCards" :lookup-cards="collectionCards" :selected-ids="selectedHandCardIds"
            @select-item="pickCard">
          </MyCarousel>
        </div>

        <!-- Judging Area -->
        <div v-if="roundStatus === 'round_submitted'" class="w-full h-full overflow-y-visible z-10">
          <MyCarousel :items="judgingCards" :lookup-cards="collectionCards" :selected-ids="selectedJudgingCardIds"
            selected-class="selected-judging" @select-item="pickWinner">
          </MyCarousel>
        </div>

        <!-- Winner Area -->
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
      </TransitionGroup>
    </section>

    <!-- Action Buttons -->
    <section name="action-buttons" v-if="gameStarted"
      class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] w-full flex flex-row items-center justify-center transition-all z-40">
      <transition name="fade" mode="out-in">
        <Button v-if="roundStatus === 'round_start' && !isCzar && !isWhiteCardsSubmitted" @click="submitCards()"
          :disabled="isSubmittingWhiteCards || myChosenWhiteCards.length !== numberOfCardsToPlay" variant="primary"
          size="md" class="rounded-xl" key="submit-cards">
          {{
            isSubmittingWhiteCards
              ? "Submitting..."
              : myChosenWhiteCards.length === numberOfCardsToPlay
                ? "Submit"
                : `${myChosenWhiteCards.length} / ${numberOfCardsToPlay} Cards`
          }}
        </Button>
        <Button v-else-if="roundStatus === 'round_submitted' && isCzar" @click="submitWinner(selectedPlayerSubmission)"
          :disabled="isChoosingWinner" variant="primary" size="md" class="rounded-xl" key="choose-winner">
          {{
            isChoosingWinner
              ? "Choosing..."
              : "Choose"
          }}
        </Button>
        <Button v-else-if="roundStatus === 'round_end' && isCzar" @click="startNexRound()"
          :disabled="isStartingNextRound" variant="primary" size="md" class="rounded-xl" key="next-round">
          {{
            isStartingNextRound
              ? "Loading..."
              : "Next Round"
          }}
        </Button>
      </transition>
    </section>
  </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 300ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

:deep(.card.selected-judging) {
  @apply border-red-400 bg-red-50 ring-2 ring-red-200;
}
</style>
