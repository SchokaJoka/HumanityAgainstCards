<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";
import myCarouselJudging from "~/components/myCarouselJudging.vue";
import LeaveConfirmOverlay from '~/components/LeaveConfirmOverlay.vue';
import SubmittedCards from "~/components/SubmittedCards.vue";

// VARIABLES
// ============================================================
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const route = useRoute();
const roomId = useState<string | null>("roomId", () => null);
const playerId = useState<string | null>("playerId", () => null);

const roomCode = ref<string>("");
const playerSubmissions = useState<any[]>("playerSubmissions", () => []);
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

const avatarModules = import.meta.glob("~/assets/img/avatar/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function getAvatarSrc(avatarId: unknown): string {
  const id = String(avatarId ?? "1").trim();
  const targetName = `avatar-${id}.png`;
  const matchedEntry = Object.entries(avatarModules).find(([path]) =>
    path.endsWith(targetName),
  );

  if (matchedEntry) {
    return matchedEntry[1];
  }

  const fallbackEntry = Object.entries(avatarModules).find(([path]) =>
    path.endsWith("avatar-1.png"),
  );
  return fallbackEntry?.[1] ?? "";
}

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

const selectedCards = computed(() =>
  myChosenWhiteCards.value.filter((c: any) => !!c),
);

const selectedWhiteCardCount = computed(() => selectedCards.value.length);

const selectedHandCardIds = computed(() =>
  selectedCards.value.map((c: any) => c.id),
);

const normalizeChosenSlots = (count: number) => {
  const next = Array.from({ length: count }, (_, index) =>
    myChosenWhiteCards.value[index] ?? null,
  );
  myChosenWhiteCards.value = next;
};

watch(
  numberOfCardsToPlay,
  (count) => {
    if (!count) {
      myChosenWhiteCards.value = [];
      return;
    }
    normalizeChosenSlots(count);
  },
  { immediate: true },
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
  const submissions = playerSubmissions.value.flatMap(ps =>
    (ps.metadata?.submitted_cards || []).map((cardId: string) => ({
      id: `${ps.id}-${cardId}`,
      card_id: cardId,
      submission: ps
    }))
  );
  return submissions;
});

const selectedJudgingCardIds = computed(() => {
  if (!selectedPlayerSubmission.value) return [];
  return (selectedPlayerSubmission.value.metadata?.submitted_cards || []).map((cardId: string) =>
    `${selectedPlayerSubmission.value.id}-${cardId}`
  );
});

const leftSubmissions = computed(() =>
  playerSubmissions.value.filter((_, index) => index % 2 === 1),
);

const rightSubmissions = computed(() =>
  playerSubmissions.value.filter((_, index) => index % 2 === 0),
);

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

  const count = Number(numberOfCardsToPlay.value ?? 0);
  if (!count) return;

  if (myChosenWhiteCards.value.length !== count) {
    normalizeChosenSlots(count);
  }

  const slots = myChosenWhiteCards.value;

  const idx = slots.findIndex((c: any) => c?.id === card.id);
  if (idx !== -1) {
    slots[idx] = null;
    return;
  }

  const emptyIndex = slots.findIndex((c: any) => !c);
  if (emptyIndex === -1) return;

  slots[emptyIndex] = card;
}

async function resetCards() {
  const count = Number(numberOfCardsToPlay.value ?? 0);
  myChosenWhiteCards.value = count
    ? Array.from({ length: count }, () => null)
    : [];
  whiteCardPickError.value = "";
}

async function submitCards() {
  if (selectedWhiteCardCount.value === numberOfCardsToPlay.value) {
    if (isSubmittingWhiteCards.value) return;
    isSubmittingWhiteCards.value = true;

    try {
      const { data, error } = await supabase.functions.invoke("submit_white_cards", {
        method: "POST",
        body: {
          czar_id: czarId.value,
          user_id: playerId.value,
          room_id: roomId.value,
          submitted_cards: selectedCards.value,
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
        const submittedHandIds = new Set(selectedCards.value.map((c: any) => c.id).filter(Boolean));
        const submittedCardIds = new Set(selectedCards.value.map((c: any) => c.card_id || c.cardId || c.id).filter(Boolean));

        playerHandCards.value = playerHandCards.value.filter((handCard: any) => {
          if (submittedHandIds.has(handCard.id)) return false;
          if (submittedCardIds.has(handCard.card_id)) return false;
          return true;
        });

        const count = Number(numberOfCardsToPlay.value ?? 0);
        myChosenWhiteCards.value = count
          ? Array.from({ length: count }, () => null)
          : [];
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
    const selected = selectedWhiteCardCount.value;
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
  isChoosingWinner.value = true;

  if (!winnerSubmission) {
    errorMessage.value = "Please pick a winner submission";
    isChoosingWinner.value = false;
    return;
  }

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
      isChoosingWinner.value = false;

      return;
    }

    if ((data as any)?.error) {
      errorMessage.value = (data as any).error;
      isChoosingWinner.value = false;
      return
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
    if (initialMetadata.roundStatus !== "lobby") {
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
  if (!canEditChosenGaps.value || gapIndex == null) return;
  if (gapIndex < 0 || gapIndex >= myChosenWhiteCards.value.length) return;
  myChosenWhiteCards.value[gapIndex] = null;
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
  <main class="flex flex-col items-center w-full h-lvh overflow-w-hidden overflow-y-auto transition-color" :class="roundStatus === 'round_end'
    ? 'bg-sky-300 text-black'
    : isCzar
      ? 'bg-black text-white'
      : 'bg-white text-black'">
    <header ref="headerEl" class="fixed pt-[env(safe-area-inset-top),0px)] w-full flex flex-col p-4 gap-2 z-40" :class="roundStatus === 'round_end'
      ? 'bg-sky-300 text-black'
      : isCzar
        ? 'bg-black text-white'
        : 'bg-white text-black'">
      <div class="w-full flex flex-row items-stretch justify-between gap-2 overflow-y-visible">
        <div class="flex flex-row pl-1 w-full items-center justify-start overflow-x-auto overflow-y-visible gap-2">
          <div v-if="roundStatus !== 'round_end'" v-for="player in players" :key="player.user_id"
            class="relative flex flex-col items-center gap-0 overflow-y-visible">
            <transition name="icon-fade">
              <div v-if="player.user_id === gameMasterId && player.user_id !== czarId" class="absolute top-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="17" viewBox="0 0 24 17" fill="none">
                  <path
                    d="M3.59299 16.8398L2.06597 7.51986C2.02605 7.51986 1.98093 7.52489 1.93063 7.53496C1.88033 7.54502 1.83562 7.54967 1.79649 7.5489C1.29747 7.5489 0.873497 7.37934 0.524578 7.04022C0.17566 6.7011 0.000801163 6.28997 2.72196e-06 5.80684C-0.000795719 5.32371 0.174063 4.91259 0.524578 4.57347C0.875094 4.23435 1.29907 4.06479 1.79649 4.06479C2.29392 4.06479 2.7183 4.23435 3.06961 4.57347C3.42092 4.91259 3.59538 5.32371 3.59299 5.80684C3.59299 5.94234 3.57782 6.06815 3.54748 6.18429C3.51713 6.30043 3.4824 6.40688 3.44328 6.50366L7.18597 8.12958L10.9287 3.16473C10.7091 3.00988 10.5294 2.80664 10.3897 2.55501C10.25 2.30338 10.1801 2.0324 10.1801 1.74205C10.1801 1.25815 10.355 0.84664 10.7047 0.507521C11.0544 0.168401 11.4784 -0.0007716 11.9766 2.64549e-06C12.4748 0.000776891 12.8992 0.170337 13.2497 0.508682C13.6002 0.847027 13.7747 1.25815 13.7731 1.74205C13.7731 2.0324 13.7032 2.30338 13.5635 2.55501C13.4238 2.80664 13.2441 3.00988 13.0246 3.16473L16.7673 8.12958L20.51 6.50366C20.47 6.40688 20.4349 6.30043 20.4046 6.18429C20.3742 6.06815 20.3594 5.94234 20.3602 5.80684C20.3602 5.32294 20.5351 4.91143 20.8848 4.57231C21.2345 4.23319 21.6585 4.06402 22.1567 4.06479C22.655 4.06557 23.0793 4.23513 23.4298 4.57347C23.7804 4.91182 23.9548 5.32294 23.9532 5.80684C23.9516 6.29075 23.7772 6.70226 23.4298 7.04138C23.0825 7.3805 22.6582 7.54967 22.1567 7.5489C22.1168 7.5489 22.0721 7.54425 22.0226 7.53496C21.9731 7.52567 21.928 7.52064 21.8873 7.51986L20.3602 16.8398H3.59299Z"
                    :fill="isCzar ? 'white' : 'black'" />
                </svg>
              </div>
            </transition>
            <transition name="icon-fade">
              <div v-if="player.user_id === czarId" class="absolute -top-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="21" viewBox="0 0 19 21" fill="none">
                  <path
                    d="M10 0.0478516H10.0205V3H13V3.04785H13.0205V5.04785H10.0205V10H10.5498C11.6498 8.09 14.1 7.43004 16 8.54004C16.921 9.06684 17.5958 9.93691 17.877 10.96C17.9708 11.3017 18.0175 11.6516 18.0195 12C18.0197 12.0159 18.0205 12.032 18.0205 12.0479C18.0205 12.0583 18.0196 12.0687 18.0195 12.0791C18.019 12.1166 18.0182 12.154 18.0166 12.1914C18.0156 12.2122 18.0141 12.2327 18.0127 12.2529C17.9778 12.8613 17.8058 13.4597 17.5 14L16.0928 17.752L16.0205 18.0479V20.0479H2.02051V20H2V18L1.99512 17.9795L0.520508 14.0479C0.169677 13.428 -0.00594717 12.7315 0.000976562 12.0312C0.000875399 12.0209 0 12.0105 0 12C0 10.9391 0.42173 9.92202 1.17188 9.17188C1.92202 8.42174 2.93914 8 4 8C5.41999 8.00001 6.7402 8.77001 7.4502 10H8V5.04785H5.02051V5H5V3H8V0H10V0.0478516Z"
                    :fill="isCzar ? 'white': 'black'" />
                </svg>
              </div>
            </transition>

            <div
              class="relative flex items-center justify-center size-14 rounded-full border-2 transition-all overflow-y-visible mt-3"
              :class="isCzar ? 'border-white bg-black' : 'border-black bg-white'">
              <img :src="getAvatarSrc(player.metadata?.avatar_url)" alt="Player avatar"
                class="size-12 rounded-full object-cover" />
              <div
                class="absolute -bottom-1 -left-1 text-xs size-4 font-light rounded-full flex items-center justify-center"
                :class="isCzar ? 'bg-white text-black' : 'bg-black text-white'">
                {{ getPlayerScore(player.user_id) }}
              </div>
              <transition name="icon-fade">
                <div v-if="player.status === 'submitted'" class="absolute -bottom-1 -right-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 18 18" fill="none">
                    <g clip-path="url(#clip0_531_1565)">
                      <path fill-rule="evenodd" clip-rule="evenodd"
                        d="M9.00049 18C10.6264 18.0001 12.2219 17.5598 13.6176 16.7259C15.0133 15.8919 16.157 14.6955 16.9273 13.2636C17.6975 11.8318 18.0655 10.218 17.9921 8.59378C17.9187 6.96956 17.4067 5.39556 16.5105 4.039L9.35549 11.989C9.02128 12.3604 8.56016 12.5933 8.06287 12.6418C7.56558 12.6903 7.06816 12.5509 6.66849 12.251L3.40049 9.8C3.18832 9.64087 3.04805 9.40397 3.01054 9.14142C2.97304 8.87887 3.04136 8.61217 3.20049 8.4C3.35962 8.18783 3.59652 8.04756 3.85907 8.01005C4.12162 7.97254 4.38832 8.04087 4.60049 8.2L7.86849 10.651L15.2145 2.49C14.1503 1.47411 12.8533 0.734601 11.437 0.336222C10.0207 -0.0621564 8.52837 -0.107256 7.09062 0.204872C5.65287 0.517001 4.31356 1.17684 3.18996 2.12661C2.06636 3.07639 1.19273 4.28713 0.645571 5.65284C0.0984067 7.01855 -0.105607 8.49757 0.051393 9.96041C0.208393 11.4233 0.721619 12.8253 1.54613 14.0438C2.37065 15.2623 3.48131 16.2601 4.78087 16.9498C6.08042 17.6395 7.52925 18.0001 9.00049 18Z"
                        :fill="isCzar ? 'white' : 'black'" />
                    </g>
                    <defs>
                      <clipPath id="clip0_531_1565">
                        <rect width="18.0013" height="18" fill="white" />
                      </clipPath>
                    </defs>
                  </svg>
                </div>
              </transition>
              <transition name="icon-fade">
                <div v-if="player.user_id === czarId" class="absolute -bottom-3 -right-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="44" height="50" viewBox="0 0 44 50" fill="none">
                    <g clip-path="url(#clip0_531_1538)">
                      <path
                        d="M29.7508 16.6526L30.5465 16.5475L8.64914 45.1074L5.55149 42.7324L27.4488 14.1725L27.8102 16.9088L29.7508 16.6526Z"
                        :fill="isCzar ? 'white' : 'black'" />
                      <circle cx="32.8208" cy="10.3304" r="5.5" :fill="isCzar ? 'white' : 'black'" />
                    </g>
                    <defs>
                      <clipPath id="clip0_531_1538">
                        <rect width="38.0832" height="44.9671" fill="white"
                          transform="translate(0 4.98537) rotate(-7.52202)" />
                      </clipPath>
                    </defs>
                  </svg>
                </div>
              </transition>

            </div>
            <span class="text-xs font-normal transition">
              {{ player.user_id === playerId ? 'You' : player.user_name }}
            </span>
          </div>
          <div v-if="roundStatus === 'round_end' && winnerPlayer" class="flex flex-row w-full gap-2">
            <div class="flex flex-col items-center gap-1">
              <div class="flex items-center justify-center size-12 rounded-full border-2 border-black transition-all">
                <img :src="getAvatarSrc(winnerPlayer.metadata?.avatar_url)" alt="Player avatar"
                  class="size-10 rounded-full object-cover" />
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
        <Button @click="showLeaveConfirm = true" variant="tertiary"
          :class="isCzar ? 'bg-white text-black rounded border-white' : 'bg-black text-white rounded border-black'"
          size="md" class="">Leave</Button>
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
    <TransitionGroup name="section-swap" appear>
      <!-- Game Section -->
      <section name="game-section" v-if="gameStarted && roundStatus !== 'lobby' && roundStatus !== 'round_end'"
        key="game-section"
        class="w-full mt-[var(--sets-header-h)] h-[100lvh] flex flex-col justify-start items-center gap-4 py-4"
        :class="isCzar ? 'flex-col-reverse justify-start' : 'flex-col justify-start'">
        <TransitionGroup name="stack-fade" appear>
          <!-- Black Card -->
          <div v-if="blackCard && !(roundStatus === 'round_submitted' && !isCzar)" key="black-card"
            class="rounded-xl border-[3px] border-white w-52 h-full max-h-64 bg-black p-4 text-normal font-bold z-20 overflow-y-auto">
            <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
              :class="part.isGap ? 'text-violet-400 black-card-text' : 'text-white black-card-text'"
              @click="deleteWhiteCardAtGap(part.gapIndex)">
              {{ part.isGap ? getWhiteCardTextAtGap(part.gapIndex) || "___" : part.text }}
            </span>
          </div>

          <!-- Player Hand -->
          <div v-if="!isCzar && roundStatus === 'round_start' && isWhiteCardsSubmitted === false" key="player-hand"
            class="w-full overflow-visible z-20">
            <MyCarousel :items="playerHandCards" :lookup-cards="collectionCards" :selected-ids="selectedHandCardIds"
              @select-item="pickCard">
            </MyCarousel>
          </div>

          <!-- Judging Area -->
          <div v-if="roundStatus === 'round_submitted'" key="judging-area" class="w-full overflow-visible z-10 h-full">
            <MyCarouselJudging v-if="isCzar" :items="judgingCards" :lookup-cards="collectionCards"
              :selected-ids="selectedJudgingCardIds" selected-class="selected-judging" @select-item="pickWinner" />

            <div v-else class="w-full px-4">
              <div class="w-full max-w-2xl mx-auto flex flex-row justify-around items-stretch gap-2">
                <!-- Left column -->
                <div class="flex flex-1 min-w-0 flex-col items-center gap-2">

                  <div v-if="blackCard" class="bg-black h-64 rounded-xl p-4 font-bold border-2 border-black">
                    <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
                      class="w-full overflow-y-auto black-card-text"
                      :class="part.isGap ? 'text-violet-500' : 'text-white'">
                      {{ part.isGap ? getWhiteCardTextAtGap(part.gapIndex) || "________" : part.text }}
                    </span>
                  </div>
                  <SubmittedCards v-for="submission in leftSubmissions" :key="submission.user_id"
                    :submission="submission" :collection-cards="collectionCards" />
                </div>

                <!-- Right column (offset) -->
                <div class="flex flex-1 min-w-0 flex-col items-center gap-2">
                  <SubmittedCards v-for="submission in rightSubmissions" :key="submission.user_id"
                    :submission="submission" :collection-cards="collectionCards" />
                </div>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </section>

      <!-- Round End Section -->
      <section name="round-end" v-if="gameStarted && roundStatus === 'round_end'" key="round-end-section"
        class="w-full mt-[var(--sets-header-h)] h-100lvh flex flex-col justify-start items-center gap-4 p-4">
        <TransitionGroup name="stack-fade" appear>
          <div key="round-end-container" class="w-full flex flex-row justify-around items-stretch gap-2 max-w-2xl">
            <TransitionGroup name="stack-fade" appear>
              <!-- Black Card -->
              <div v-if="blackCard" key="black-card-end"
                class="bg-black h-64 w-full rounded-xl p-4 font-bold border-2 border-black z-10 overflow-y-auto">
                <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
                  class="w-full overflow-y-auto black-card-text" :class="part.isGap ? 'text-violet-500' : 'text-white'"
                  @click="deleteWhiteCardAtGap(part.gapIndex)">
                  {{ part.isGap ? getWhiteCardTextAtGap(part.gapIndex) || "________" : part.text }}
                </span>
              </div>
              <!-- Winner White Cards -->
              <div key="winner-cards" class="w-full flex flex-col">
                <div v-for="cardText, index in winnerCards" :key="`winner-card-${index}`"
                  class="bg-white p-4 pr-8 min-h-32 w-full overflow-y-auto relative rounded-t-xl border-black border-x-2 border-t-2"
                  :class="[
                    index === winnerCards.length - 1 ? 'rounded-b-xl border-b-2' : '',
                    index === 0 ? 'pb-8' : '-mt-6 pb-16'
                  ]">
                  <span class="text-black font-bold white-card-text">
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
            </TransitionGroup>
          </div>

          <!-- Player Scores -->
          <div key="player-scores" class="w-full h-full flex flex-col max-w-2xl gap-2 overflow-y-auto">
            <!-- Items -->
            <TransitionGroup name="fade">
              <div v-for="(player, index) in displayedPlayers" :key="player.user_id" :class="[
                'w-full flex flex-row justify-between items-stretch border-[3px] rounded ',
                index === displayedPlayers.length - 1 ? 'bg-black text-white border-white' : 'bg-white text-black border-black'
              ]">
                <div class="w-full flex flex-row items-center">
                  <div class="flex flex-row w-full py-3 px-2 items-end justify-between">
                    <div class="flex flex-row items-end gap-1">
                      <div
                        class="border-2 rounded-full flex items-center justify-center text-white font-bold first-letter:size-12"
                        :class="index === displayedPlayers.length - 1 ? 'border-white' : 'border-black'">
                        <img class="rounded-full size-10" :src="getAvatarSrc(player.metadata?.avatar_url)"
                          alt="Player avatar" />
                      </div>
                      <div class=" text-sm">
                        {{ player.user_name }}
                      </div>
                    </div>
                    <div class="text-4xl font-bold flex items-center px-2"
                      :class="index === displayedPlayers.length - 1 ? 'text-white' : 'text-black'">
                      {{
                        index === 0 ? "1st" : index === 1 ? "2nd" : index === displayedPlayers.length - 1 ? 'Loser' :
                          `${(index as number) + 1}th`
                      }}
                    </div>
                    <div class="font-bold text-sm px-4"
                      :class="index === displayedPlayers.length - 1 ? 'text-white' : 'text-black'">
                      <span>{{ getPlayerScore(player.user_id) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </TransitionGroup>
      </section>
    </TransitionGroup>
    <!-- Action Buttons -->
    <section name="action-buttons" v-if="gameStarted"
      class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] w-full flex flex-row items-center justify-center transition-all z-30">
      <TransitionGroup name="fade">
        <Button v-if="roundStatus === 'round_start' && !isCzar && !isWhiteCardsSubmitted" @click="submitCards"
          :loading="isSubmittingWhiteCards"
          :disabled="isSubmittingWhiteCards || selectedWhiteCardCount !== numberOfCardsToPlay"
          :variant="isCzar ? 'primary' : 'secondary'" size="md" class="transition-all" key="submit-cards">
          {{
            selectedWhiteCardCount === numberOfCardsToPlay
              ? "Submit"
              : `${selectedWhiteCardCount} / ${numberOfCardsToPlay} Cards`
          }}
          <template #loading>Submitting...</template>
        </Button>
        <Button v-else-if="roundStatus === 'round_submitted' && isCzar" @click="submitWinner(selectedPlayerSubmission)"
          :loading="isChoosingWinner" :disabled="isChoosingWinner" :variant="isCzar ? 'primary' : 'secondary'" size="md"
          class="transition-all" key="choose-winner">
          Choose
          <template #loading>Choosing...</template>
        </Button>
        <Button v-else-if="roundStatus === 'round_end' && isCzar" @click="initializeNextRound(roomId)"
          :loading="isStartingNextRound" :disabled="isStartingNextRound" variant="secondary" size="md"
          class="transition-all" key="next-round">
          Next Round
          <template #loading>Loading...</template>
        </Button>
      </TransitionGroup>
    </section>
  </main>
</template>

<style scoped>
.section-swap-enter-active,
.section-swap-leave-active {
  transition: opacity 420ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.section-swap-enter-from,
.section-swap-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.stack-fade-enter-active,
.stack-fade-leave-active {
  transition: opacity 420ms ease, transform 320ms ease;
}

.stack-fade-enter-from,
.stack-fade-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.985);
}

.black-card-text {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.white-card-text {
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* SVG Icon Transitions */
.icon-fade-enter-active,
.icon-fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.icon-fade-enter-from,
.icon-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

:deep(.card.selected-judging) {
  @apply border-red-400 bg-red-50 ring-2 ring-red-200;
}
</style>
