<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";
import myCarouselJudging from "~/components/myCarouselJudging.vue";
import LeaveConfirmOverlay from '~/components/LeaveConfirmOverlay.vue';

// VARIABLES
// ============================================================
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const route = useRoute();
const roomId = useState<string | null>("roomId", () => null);
const playerId = useState<string | null>("playerId", () => null);

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
const errorMessage = ref<string>("");

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
  loadInitialHandCards,
  leaveRoomRealtime,
  setRoomRoundStatus,
} = useRoom();

const showLeaveConfirm = ref(false);
const isLeavingGame = ref(false);
const isReturningToLobby = ref(false);

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

  // Functions
  initializeGame,
  initializeNextRound,
  // getGameMasterId,
  handleGameStateChanges,
} = useGameManager();

const { getPlayerScore, updatePlayerScoreFromMember, syncPlayerScoresForRoom } = usePlayerScores();
// ============================================================

// COMPUTED PROPERTIES
// ============================================================

const czarId = computed(() => {
  if (!gameStarted.value) return null;
  return gameState.value?.czar_id ?? null;
});

const isCzar = useState<boolean>("isCzar", () => false);

watch([playerId, czarId], () => {
  isCzar.value = !!playerId.value && playerId.value === czarId.value;
});

watch([playerId, gameMasterId], ([nextPlayerId, nextGameMasterId]) => {
  isGameMaster.value = !!nextPlayerId && nextGameMasterId === nextPlayerId;
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

const winnerPlayer = computed(() => {
  return players.value.find(p => p.user_id === winnerUserId.value);
});

const { playerScores } = usePlayerScores();

const sortedPlayersByScore = computed(() => {
  return [...players.value].sort((a, b) => {
    const scoreA = playerScores.value[a.user_id] ?? 0;
    const scoreB = playerScores.value[b.user_id] ?? 0;
    return scoreB - scoreA;
  });
});

const displayedPlayers = computed(() => {
  const sorted = sortedPlayersByScore.value;
  if (sorted.length <= 3) return sorted;
  const first2 = sorted.slice(0, 2);
  const last = sorted.slice(-1);
  return [...first2, ...last];
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
      const { data, error } = await supabase.functions.invoke("submit_white_cards", {
        method: "POST",
        body: {
          czar_id: czarId.value,
          user_id: playerId.value,
          room_id: roomId.value,
          submitted_cards: myChosenWhiteCards.value,
        },
      });

      if (error) {
        console.error("[EDGE] Error submitting white cards:", error);
        errorMessage.value = error.message || "Failed to submit cards.";
      } else if ((data as any)?.error) {
        // Edge function returned structured error payload (200) — surface to UI
        errorMessage.value = (data as any).error;
        console.warn("[EDGE] submit_white_cards reported error:", data);
      } else {
        // Remove submitted cards from local hand immediately (frontend UX).
        // Some UI items may carry `id` (hand_card.id) or `card_id` (cards.id),
        // so remove by either to avoid stale items.
        const submittedHandIds = new Set(myChosenWhiteCards.value.map((c: any) => c.id).filter(Boolean));
        const submittedCardIds = new Set(myChosenWhiteCards.value.map((c: any) => c.card_id || c.cardId || c.id).filter(Boolean));

        playerHandCards.value = playerHandCards.value.filter((handCard: any) => {
          if (submittedHandIds.has(handCard.id)) return false;
          if (submittedCardIds.has(handCard.card_id)) return false;
          return true;
        });

        myChosenWhiteCards.value = [];
        whiteCardPickError.value = "";

        isWhiteCardsSubmitted.value = true;

        // Ensure frontend reflects DB state (in case of race when pool is rebuilt)
        try {
          if (roomId.value && playerId.value) {
            await loadInitialHandCards(roomId.value, playerId.value);
          }
        } catch (e) {
          console.warn("Failed to reload hand cards after submit:", e);
        }

        console.info("[EDGE] success submit_white_cards", data);
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
  selectedPlayerSubmission.value = item?.submission ?? null;
}

async function resetWinner() {
  selectedPlayerSubmission.value = null;
  errorMessage.value = "";
}

async function submitWinner(winnerSubmission: any) {
  if (!isCzar.value) return;
  if (isChoosingWinner.value) return;

  if (!winnerSubmission) {
    errorMessage.value = "Please pick a winner submission";
    return;
  }

  isChoosingWinner.value = true;

  console.log("Selected winner: ", winnerSubmission);

  try {
    const { data, error } = await supabase.functions.invoke("select_winner", {
      method: "POST",
      body: {
        room_id: roomId.value,
        winner: winnerSubmission,
      },
    });

    if (error) {
      console.error("Error selecting winner:", error);
      errorMessage.value = error.message || "Failed to choose winner.";
      return;
    }

    if ((data as any)?.error) {
      errorMessage.value = (data as any).error;
    }
  } finally {
    isChoosingWinner.value = false;
  }
}

// clear global error when a selection is made
watch(selectedPlayerSubmission, (next) => {
  if (next) errorMessage.value = "";
});

// Auto-clear page error messages after 3000ms
let pageErrorTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => errorMessage.value,
  (next) => {
    if (pageErrorTimer) {
      clearTimeout(pageErrorTimer);
      pageErrorTimer = null;
    }
    if (next) {
      pageErrorTimer = setTimeout(() => {
        errorMessage.value = "";
        pageErrorTimer = null;
      }, 3000);
    }
  },
);
// ============================================================

// onMounted, onUnmounted
// ============================================================
const isRoomNavigation = useState<boolean>("isRoomNavigation", () => false);

onMounted(async () => {
  isRoomNavigation.value = false;
  roomCode.value = String(route.params.roomCode ?? "").toUpperCase();

  roomId.value = await getRoomIdByCode(roomCode.value);

  if (!roomId.value) {
    console.error("Missing room ID");
    return;
  }

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

  const { data: room } = await supabase
    .from("rooms")
    .select("owner")
    .eq("id", roomId.value)
    .single();
  gameMasterId.value = room?.owner ?? "";

  await syncPlayerScoresForRoom(roomId.value);

  if (!gameChannel.value) {
    console.warn("gameChannel not exists, rejoining");
    const joined = await enterRoom(roomId.value, roomCode.value, playerId.value);
    if (!joined) {
      await navigateTo(`/play/${roomCode.value}/lobby`);
      return;
    }
  }

  // STEP 2: Conditionally load game state if game already started
  const initialMetadata = (roomMetadata?.metadata ?? null) as any;
  if (initialMetadata) {
    if (initialMetadata.round_status !== "lobby") {
      console.info("GAME IN PROGRESS - loading game state for player");

      // Load initial hand cards using the new function
      await loadInitialHandCards(roomId.value, playerId.value);

      // Load collection cards if available
      if (initialMetadata.set_id) {
        const setId = initialMetadata.set_id;
        let query = supabase.from("cards").select("*");
        if (Array.isArray(setId)) {
          query = query.in("collection_id", setId);
        } else {
          query = query.eq("collection_id", setId);
        }
        const { data: cardsData } = await query;

        collectionCards.value = cardsData ?? [];
      }

      await syncPlayerScoresForRoom(roomId.value);

      blackCard.value = initialMetadata.black_card ?? null;
    }
    await handleGameStateChanges(initialMetadata);
  }
});

onBeforeRouteLeave((to) => {
  // If moving within the same room flow, preserve the channel
  const nextCode = String(to.params.roomCode ?? "").toUpperCase();
  const currentCode = String(route.params.roomCode ?? "").toUpperCase();
  if (nextCode && nextCode === currentCode) {
    isRoomNavigation.value = true;
  }
});

onUnmounted(async () => {
  console.log("Unmounting game component, leaving room/channel if necessary.");

  blackCard.value = null;
  playerSubmissions.value = [];
  winnerUserId.value = null;
  winnerUsername.value = "";
  winnerCards.value = [];
  playerHandCards.value = [];
  myChosenWhiteCards.value = [];
  selectedPlayerSubmission.value = null;
  isWhiteCardsSubmitted.value = false;
  isChoosingWinner.value = false;

  if (!isRoomNavigation.value) {
    if (!isLeaving.value && roomId.value && playerId.value) {
      await markMemberInactive(roomId.value, playerId.value);
    }

    await leaveRoomRealtime();
  }

});
// ============================================================

// OTHER
// ============================================================

const roundStatusMessage = computed(() => {
  switch (roundStatus.value) {
    case "lobby":
      return "Waiting for players...";
    case "round_start":
      return isCzar.value
        ? "Wait for players to submit..."
        : isWhiteCardsSubmitted.value
          ? "Waiting for other players..."
          : "Pick your white card(s)!";
    case "round_submitted":
      return isCzar.value
        ? "Pick the winner!"
        : "Waiting for Czar...";
    case "round_end":
      return "";
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

async function handleLeaveConfirmed() {
  if (isLeavingGame.value) return;

  isLeavingGame.value = true;
  try {
    if (roomId.value && playerId.value) {
      await deletePlayerFromRoomTable(roomId.value, playerId.value);
    }
    await leaveRoomRealtime();
    navigateTo('/');
  } finally {
    isLeavingGame.value = false;
    showLeaveConfirm.value = false;
  }
}

async function handleBackToLobbyConfirmed() {
  if (isReturningToLobby.value) return;
  if (!roomId.value) return;

  isReturningToLobby.value = true;
  try {
    const { data, error } = await supabase.functions.invoke("end_game_go_back_to_lobby", {
      method: "POST",
      body: { room_id: roomId.value }
    });
    if (error) console.error("[EDGE] end_game_go_back_to_lobby error:", error);
    else console.log("[EDGE] end_game_go_back_to_lobby", data);
  } catch (err) {
    console.error("Error invoking end_game_go_back_to_lobby:", err);
  } finally {
    isReturningToLobby.value = false;
  }

  navigateTo(`/play/${route.params.roomCode}/lobby`);
}

// DEV DEBUGGING
// ============================================================
const dev2gaps = ref(false);
// ============================================================
</script>

<template>
  <main class="flex flex-col items-center w-full h-dvh overflow-w-hidden overflow-y-hidden transition-color" :class="roundStatus === 'round_end'
    ? 'bg-sky-300 text-black'
    : isCzar
      ? 'bg-black text-white'
      : 'bg-white text-black'">
    <header ref="headerEl" class="fixed pt-[env(safe-area-inset-top),0px)] w-full flex flex-col p-4 gap-2 z-40" :class="roundStatus === 'round_end'
      ? 'bg-sky-300 text-black'
      : isCzar
        ? 'bg-black text-white'
        : 'bg-white text-black'">
      <div class="w-full flex flex-row items-stretch justify-between gap-2">
        <div class="flex flex-row w-full items-center justify-start overflow-x-auto gap-2">
          <div v-if="roundStatus !== 'round_end'" v-for="player in players" :key="player.user_id"
            class="flex flex-col items-center gap-1">
            <div class="flex items-center justify-center size-12 rounded-full border-2 transition-all" :class="czarId === player.user_id
              ? 'border-yellow-300'
              : player.status === 'submitted'
                ? 'border-green-300'
                : 'border-current'
              ">
              <img src="https://placehold.co/40" alt="Player avatar" class="size-10 rounded-full object-cover" />

            </div>
            <span class="text-xs font-normal transition">
              {{ player.user_id === playerId ? 'You' : player.user_name }}
            </span>
          </div>
          <div v-if="roundStatus === 'round_end' && winnerPlayer" class="flex flex-row w-full gap-2">
            <div class="flex flex-col items-center gap-1">
              <div class="flex items-center justify-center size-12 rounded-full border-2 border-black transition-all">
                <img src="https://placehold.co/40" alt="Player avatar" class="size-10 rounded-full object-cover" />
              </div>
            </div>
            <div class="flex w-full items-center justify-center text-lg font-bold overflow-clip whitespace-nowrap">
              {{ `${winnerUsername.toUpperCase()} won!` }}
            </div>
          </div>
        </div>
        <LeaveConfirmOverlay :show="showLeaveConfirm" :is-game-master="isGameMaster" :round-status="roundStatus"
          :leave-loading="isLeavingGame" :back-to-lobby-loading="isReturningToLobby" @close="showLeaveConfirm = false"
          @leave="handleLeaveConfirmed" @back-to-lobby="handleBackToLobbyConfirmed" />
        <Button @click="showLeaveConfirm = true" :variant="isCzar ? 'primary' : 'secondary'" size="md"
          class="">Leave</Button>
      </div>
      <div class="w-full flex flex-row gap-2">
        <div class="w-full text-center font-medium text-md transition-all">
          {{ roundStatusMessage }}
        </div>
      </div>
      <div v-if="errorMessage" class="w-full mt-2">
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm text-center">
          {{ errorMessage }}
        </div>
      </div>
    </header>
    <TransitionGroup>
      <!-- Game Section -->
      <section name="game-section" v-if="gameStarted && roundStatus !== 'lobby' && roundStatus !== 'round_end'"
        class="w-full mt-[var(--sets-header-h)] h-[calc(100dvh-var(--sets-header-h))] flex items-center gap-2 overflow-y-visible pb-4"
        :class="isCzar ? 'flex-col-reverse justify-start' : 'flex-col justify-start'">
        <TransitionGroup name="fade">
          <!-- Black Card -->
          <div v-if="blackCard"
            class="rounded-xl border-[3px] border-white w-52 h-64 bg-black p-4 text-normal font-bold z-10 overflow-y-auto">
            <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
              :class="part.isGap ? 'text-violet-400' : 'text-white'" @click="deleteWhiteCardAtGap(part.gapIndex)">
              {{ part.isGap ? getWhiteCardTextAtGap(part.gapIndex) || "___" : part.text }}
            </span>
          </div>

          <!-- Player Hand -->
          <div v-if="!isCzar && roundStatus === 'round_start' && isWhiteCardsSubmitted === false"
            class="w-full overflow-visible z-20">
            <MyCarousel :items="playerHandCards" :lookup-cards="collectionCards" :selected-ids="selectedHandCardIds"
              @select-item="pickCard">
            </MyCarousel>
          </div>

          <!-- Judging Area -->
          <div v-if="roundStatus === 'round_submitted'" class="w-full overflow-visible z-20">
            <MyCarouselJudging :items="judgingCards" :lookup-cards="collectionCards"
              :selected-ids="selectedJudgingCardIds" selected-class="selected-judging" @select-item="pickWinner" />
          </div>
        </TransitionGroup>
      </section>

      <!-- Round End Section -->
      <section name="round-end" v-if="gameStarted && roundStatus === 'round_end'"
        class="w-full mt-[var(--sets-header-h)] h-[calc(100dvh-var(--sets-header-h))] flex flex-col justify-start items-center gap-4 p-4">

        <!-- Winner Submission -->
        <div class="w-full flex flex-row justify-around items-stretch gap-2 max-w-2xl">
          <!-- Black Card -->
          <div v-if="blackCard" class="bg-black h-64 w-full rounded-xl p-4 font-bold border-2 border-black z-10">
            <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
              class="w-full overflow-y-auto" :class="part.isGap ? 'text-violet-500' : 'text-white'"
              @click="deleteWhiteCardAtGap(part.gapIndex)">
              {{ part.isGap ? getWhiteCardTextAtGap(part.gapIndex) || "________" : part.text }}
            </span>
          </div>
          <!-- Winner White Cards -->
          <div class="w-full min-h-full flex flex-col">
            <div v-for="cardText, index in winnerCards"
              class="bg-white p-4 pr-8 shadow-xl h-full relative rounded-t-xl border-black border-x-2 border-t-2"
              :class="[
                index === winnerCards.length - 1 ? 'rounded-b-xl border-b-2' : '',
                index === 0 ? 'pb-8' : '-mt-6 pb-16'
              ]">
              <span class="text-black font-bold">
                {{collectionCards.find((c: any) => c.id === cardText)?.text || "Unknown card"}}
              </span>
              <div
                class="absolute top-2 right-2 size-8 p-[0.1rem] flex items-center justify-center bg-white rounded-full text-xs font-bold">
                <div class="bg-black size-full rounded-full flex items-center justify-center text-white font-bold">
                  {{ index + 1 || "error" }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Player Scores -->
        <div class="w-full h-full flex flex-col max-w-2xl gap-4 p-4 overflow-y-auto">
          <!-- Items -->
          <TransitionGroup name="fade">
            <div v-for="(player, index) in displayedPlayers" :key="player.user_id" :class="[
              'w-full flex flex-row justify-between items-stretch border-[3px] ',
              index === displayedPlayers.length - 1 ? 'bg-black text-white border-white' : 'bg-white text-black border-black'
            ]">
              <div class="w-full flex flex-row items-center">
                <div class="text-2xl flex items-center h-full px-4"
                  :class="index === displayedPlayers.length - 1 ? 'bg-white text-black' : 'bg-black text-white'">
                  {{
                    index === displayedPlayers.length - 1 ? "Last" : index + 1 + '.'
                  }}
                </div>
                <div class="flex flex-row w-full py-2 px-4 items-center justify-between">
                  <div class="flex flex-row items-center gap-2">
                    <div
                      class="border-2 rounded-full flex items-center justify-center text-white font-bold mb-1 size-12"
                      :class="index === displayedPlayers.length - 1 ? 'border-white' : 'border-black'">
                      <img class="rounded-full size-10" src="https://placehold.co/50x50" />
                    </div>
                    <div class="">
                      {{ player.user_name }}
                    </div>
                  </div>
                  <div class="bg-black rounded-full flex items-center justify-center text-white font-bold mb-1 size-10">
                    <span>{{ getPlayerScore(player.user_id) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </section>

      <!-- Action Buttons -->
      <section name="action-buttons" v-if="gameStarted"
        class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] w-full flex flex-row items-center justify-center transition-all z-30">
        <transition name="fade" mode="out-in">
          <Button v-if="roundStatus === 'round_start' && !isCzar && !isWhiteCardsSubmitted" @click="submitCards"
            :loading="isSubmittingWhiteCards"
            :disabled="isSubmittingWhiteCards || myChosenWhiteCards.length !== numberOfCardsToPlay"
            :variant="isCzar ? 'primary' : 'secondary'" size="md" class="" key="submit-cards">
            {{
              myChosenWhiteCards.length === numberOfCardsToPlay
                ? "Submit"
                : `${myChosenWhiteCards.length} / ${numberOfCardsToPlay} Cards`
            }}
            <template #loading>Submitting...</template>
          </Button>
          <Button v-else-if="roundStatus === 'round_submitted' && isCzar"
            @click="submitWinner(selectedPlayerSubmission)" :loading="isChoosingWinner" :disabled="isChoosingWinner"
            :variant="isCzar ? 'primary' : 'secondary'" size="md" class="" key="choose-winner">
            Choose
            <template #loading>Choosing...</template>
          </Button>
          <Button v-else-if="roundStatus === 'round_end' && isCzar" @click="initializeNextRound(roomId)"
            :loading="isStartingNextRound" :disabled="isStartingNextRound" variant="secondary" size="md" class=""
            key="next-round">
            Next Round
            <template #loading>Loading...</template>
          </Button>
        </transition>
      </section>
    </TransitionGroup>
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
