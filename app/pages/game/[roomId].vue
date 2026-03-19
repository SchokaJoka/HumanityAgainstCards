<script setup lang="ts">
import { useCards } from "~/composables/useCards";
import { useRoom } from "~/composables/useRoom";
import { useSubmissionSelector } from "~/composables/useSubmissionSelector";
import { useBlackCardGapTestToggle } from "~/composables/useBlackCardGapTestToggle";
import type { RealtimeChannel } from "@supabase/supabase-js";

const route = useRoute();
const user = useSupabaseUser();
const supabase = useSupabaseClient();
const { getCardCollections } = useCards();

const roomCode = String(route.params.roomId ?? "").toUpperCase();
const players = ref([]);
const playerScores = ref<Record<string, number | null>>({});
const roomId = ref<string | null>(null);
const playerId = ref<string | null>(null);
const {
  // gameChannel ref
  gameChannel,

  // variables
  isLeaving,
  roomData,

  // functions
  getRoomIdByCode,
  insertPlayerInRoomTable,
  joinRoom,
  leaveRoom,
} = useRoom();

const gameState = ref({});
const roundStatus = ref("lobby");

const gameStarted = ref(false);

const collectionCards = ref<any>({});
const playerHandCards = ref([]);
const blackCard = ref({});
const submittedWhiteCards = ref<any[]>([]);
const isWhiteCardsSubmitted = ref(false);

const winnerUsername = ref(null);
const winnerUserId = ref<string | null>(null);
const winnerCards = ref(null);
const presenceJoinedAt = Date.now();

const authError = ref("");
const isStartingGame = ref(false);
const isStartingNextRound = ref(false);

const handOffset = ref(0); // start index of the visible 3-card window
const visibleHandCards = 3;
const handScrollLockMs = 120;
let lastHandScrollAt = 0;

const maxHandOffset = computed(() =>
  Math.max(0, playerHandCards.value.length - visibleHandCards),
);

const clampHandOffset = (value: number) => {
  return Math.min(Math.max(value, 0), maxHandOffset.value);
};

const stepHand = (direction: 1 | -1) => {
  handOffset.value = clampHandOffset(handOffset.value + direction);
};

const handleHandScroll = (event: WheelEvent) => {
  const now = Date.now();
  if (now - lastHandScrollAt < handScrollLockMs) return;

  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

  if (Math.abs(delta) < 8) return;

  stepHand(delta > 0 ? 1 : -1);
  lastHandScrollAt = now;
};

// Keep offset valid if hand size changes (cards submitted/dealt)
watch(
  () => playerHandCards.value.length,
  () => {
    handOffset.value = clampHandOffset(handOffset.value);
  },
);

const handCardStyle = (index: number) => {
  const centerIndex = handOffset.value + 1;
  const relative = index - centerIndex;
  const d = Math.abs(relative);
  const dir = Math.sign(relative) || 1;

  const x =
    d === 0
      ? 0
      : d === 1
        ? dir * 135
        : d === 2
          ? dir * 200
          : d === 3
            ? dir * 250
            : dir * (250 + (d - 3) * 24);

  const y = Math.min(4 + d * d * 3.2, 40);

  const rotate =
    d === 0
      ? 0
      : d === 1
        ? relative * 5.5
        : d === 2
          ? relative * 4.2
          : relative * 3.2;

  const tooFar = d > 5;

  return {
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) translateX(${x}px) translateY(${y}px) rotate(${rotate}deg)`,
    zIndex: String(2000 - d * 20 - index),
    opacity: tooFar ? "0" : "1",
    pointerEvents: tooFar ? "none" : "auto",
  };
};

const gameMasterId = computed(() => {
  const firstPlayer = (players.value as any[])[0];
  return firstPlayer?.user_id ?? null;
});

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

const GAP_TOKEN = "[[W1tnYXBdXQ==]]";

const {
  setEnabled: setBlackCardMinGapTestEnabled,
  applyIfEnabled: applyBlackCardMinGapTest,
} = useBlackCardGapTestToggle({
  gapToken: GAP_TOKEN,
  minGaps: 2,
});

const enableBlackCardMinGapTest = ref(false);
watch(
  enableBlackCardMinGapTest,
  (enabled) => {
    setBlackCardMinGapTestEnabled(enabled);
  },
  { immediate: true },
);

const effectiveBlackCard = computed(() =>
  applyBlackCardMinGapTest(blackCard.value as any),
);

const numberOfCardsToPlay = computed(() => {
  const card = effectiveBlackCard.value as any;
  if (!card) return null;
  if (card.number_of_gaps === null) {
    console.warn("Black card missing number_of_gaps:", card);
    return null;
  }
  if (card.number_of_gaps === 0) return 1; // If 0, card is a question. 1 card must be played.
  return card.number_of_gaps;
});

const {
  selectedItems: myChosenWhiteCards,
  selectedSlots: chosenWhiteCardsByGap,
  errorMessage: whiteCardPickError,
  isSubmitting: isSubmittingWhiteCards,
  pick: pickWhiteCard,
  getSelectedAt: getChosenWhiteCardAtGap,
  removeSelectedAt: removeChosenWhiteCardAtGapRaw,
  submitSelection: submitWhiteCardSelection,
  resetSelection: resetWhiteCardSelection,
} = useSubmissionSelector<any>({
  mode: "slots",
  requiredCount: numberOfCardsToPlay,
  getKey: (card) => card?.id,
  deselectOnRepeatPick: true,
});

const {
  selectedItems: selectedWinnerSubmissions,
  errorMessage: winnerPickError,
  isSubmitting: isChoosingWinner,
  pick: pickWinnerSubmission,
  isSelected: isWinnerSubmissionSelected,
  submitSelection: submitWinnerSelection,
  resetSelection: resetWinnerSelection,
} = useSubmissionSelector<any>({
  requiredCount: 1,
  getKey: (submission) => submission?.user_id ?? submission?.id,
  deselectOnRepeatPick: false,
});

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
  const text =
    typeof (effectiveBlackCard.value as any)?.text === "string"
      ? (effectiveBlackCard.value as any).text
      : "";

  return getTextParts(text);
});

const canEditChosenGaps = computed(() => {
  return (
    !isCzar.value &&
    roundStatus.value === "round_start" &&
    !isWhiteCardsSubmitted.value
  );
});

const getChosenWhiteCardTextAtGap = (gapIndex?: number) => {
  if (typeof gapIndex !== "number") return null;

  const chosenCard = getChosenWhiteCardAtGap(gapIndex);
  if (!chosenCard) return null;

  const cardText = availableCollectionCards.value.find(
    (c: any) => c.id === chosenCard.card_id,
  )?.text;

  return typeof cardText === "string" ? cardText : null;
};

const removeChosenWhiteCardAtGap = (gapIndex?: number) => {
  if (!canEditChosenGaps.value) return;
  if (typeof gapIndex !== "number") return;

  removeChosenWhiteCardAtGapRaw(gapIndex);
};

const getPlayerScore = (userId: string) => {
  const score = playerScores.value[userId];
  return typeof score === "number" ? score : 0;
};

const playersWithScores = computed(() => {
  return players.value.map((player: any) => ({
    ...player,
    score: getPlayerScore(player.user_id),
  }));
});

const getPlayerDisplayStatus = (player: any) => {
  return player.status || "unknown";
};

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

const trackMyStatus = async () => {
  if (!gameChannel.value || !playerId.value || !user.value) return;

  await gameChannel.value.track({
    user_id: playerId.value,
    user_name: user.value.user_metadata?.full_name || "Guest",
    status: myPresenceStatus.value,
    joined_at: presenceJoinedAt,
  });
};

watch(myPresenceStatus, async () => {
  await trackMyStatus();
});

const round = computed(() => {
  if (!gameState.value.round) return null;
  return gameState.value.round;
});

onMounted(async () => {
  roomId.value = await getRoomIdByCode(roomCode);

  // Authentication
  // ===============================================================
  if (!user.value) {
    navigateTo("/login?redirect=joinGame&roomCode=" + roomCode);
  } else {
    playerId.value = user.value.sub;
  }
  // ===============================================================

  if (!playerId.value || !roomId.value) {
    authError.value = "Missing player or room ID.";
    return;
  }

  // Add player to room_members table (or mark active if rejoining)
  // ===============================================================
  insertPlayerInRoomTable(roomId.value, playerId.value);
  // ===============================================================

  // Join the realtime channel for this room by room ID
  // ===============================================================
  joinRoom(roomCode, playerId.value);

  gameChannel.value = supabase.channel(`${roomCode}`, {
    config: { broadcast: { self: true }, presence: { key: playerId.value } },
  });

  if (!gameChannel.value) {
    authError.value = "Failed to join game channel.";
    return;
  }
  // ===============================================================

  // Set up realtime listeners for presence and game state changes
  // ===============================================================
  gameChannel.value.on("presence", { event: "sync" }, () => {
    const newState = gameChannel.value.presenceState();

    if (!newState) {
      authError.value = "Failed to get presence state.";
      return;
    }

    players.value = Object.keys(newState)
      .map((key) => newState[key][0])
      .sort((a, b) => (a.joined_at ?? 0) - (b.joined_at ?? 0));

    // console.log("[PRESENCE] presenceState:", newState);
    // console.log("[PRESENCE] players:", players.value);
  });

  gameChannel.value.on("broadcast", { event: "cards_dealt" }, async () => {
    console.log("[BROADCAST] cards_dealt");
    const { data } = await supabase
      .from("hand_cards")
      .select("*")
      .eq("room_id", roomId.value)
      .eq("user_id", playerId.value);
    playerHandCards.value = data ?? [];
    console.log("playerHandCards:", playerHandCards.value);
  });

  gameChannel.value.on(
    "broadcast",
    { event: "game_initialize" },
    async (body) => {
      console.log("[BROADCAST] game_initialize: ", body);
      collectionCards.value = await supabase
        .from("cards")
        .select("*")
        .eq("collection_id", body.payload.set_id);
      console.log("collectionCards:", collectionCards.value);
    },
  );

  gameChannel.value.on("broadcast", { event: "game_start" }, () => {
    gameStarted.value = true;
  });

  gameChannel.value.on(
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
  gameChannel.value.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "room_members",
      filter: `room_id=eq.${roomId.value}`,
    },
    (payload) => {
      console.log("[POSTGRES CHANGES] room_members updated: ", payload);
      const updatedUserId = payload.new.user_id;
      if (!updatedUserId) return;

      playerScores.value = {
        ...playerScores.value,
        [updatedUserId]: payload.new.points ?? 0,
      };
      console.log("playerScores: ", playerScores.value);
    },
  );

  gameChannel.value.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await trackMyStatus();
    }
  });
  // ===============================================================

  // Game already in progress, sync to current state
  // ===============================================================
  if (roomData.metadata?.round_status !== "lobby") {
    const { data: handCardsData } = await supabase
      .from("hand_cards")
      .select("*")
      .eq("room_id", roomId.value)
      .eq("user_id", playerId.value);
    playerHandCards.value = handCardsData ?? [];

    collectionCards.value = await supabase
      .from("cards")
      .select("*")
      .eq("collection_id", roomData.metadata.set_id);

    gameStarted.value = true;
    handleGameStateChanges(roomData.metadata);
  }
  // ===============================================================
});

// ACTION - Start game
const startGame = async () => {
  if (!gameChannel.value || players.value.length < 2 || !isGameMaster.value) {
    if (players.value.length < 2)
      authError.value = "Need at least 2 players to start.";
    return;
  }

  if (isStartingGame.value) return;
  isStartingGame.value = true;

  try {
    // Fetch available card sets and pick the first one
    const sets = await getCardCollections();
    if (!sets || sets.length === 0) {
      authError.value = "No card sets available.";
      return;
    }

    gameChannel.value.send({
      type: "broadcast",
      event: "game_initialize",
      payload: { set_id: sets[0].id }, // For now we just hardcode a set, but you could add a UI to select one
    });

    gameChannel.value.send({
      type: "broadcast",
      event: "game_start",
    });

    const { data: edgeInitializeData } = await supabase.functions.invoke(
      "initialize_game",
      {
        method: "POST",
        body: { set_id: sets[0].id, room_id: roomId.value, cardsPerPlayer: 8 },
      },
    );

    if (!edgeInitializeData) {
      authError.value = "Failed to assign hand cards.";
      return;
    }

    gameChannel.value.send({
      type: "broadcast",
      event: "cards_dealt",
    });
  } finally {
    isStartingGame.value = false;
  }
};

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
  resetWinnerSelection();
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
  resetWhiteCardSelection();
  resetWinnerSelection();
  blackCard.value = currentMetaData.black_card;

  submittedWhiteCards.value = data ?? [];
  console.log("submittedWhiteCards: ", submittedWhiteCards.value);
}

async function handleRoundEnd(currentMetaData: object) {
  const winnerId = currentMetaData.current_winner.user_id;
  winnerUserId.value = winnerId;
  blackCard.value = currentMetaData.black_card;
  winnerUsername.value =
    players.value.find((p) => p.user_id === winnerId)?.user_name || null;
  winnerCards.value =
    currentMetaData.current_winner.metadata?.submitted_cards || null;
  resetWinnerSelection();
}

const chooseCard = async (card) => {
  if (isCzar.value) return;

  pickWhiteCard(card);
};

const submitWhiteCards = async () => {
  await submitWhiteCardSelection(async (selectedCards) => {
    const { data, error } = await supabase.functions.invoke(
      "submit_white_cards",
      {
        method: "POST",
        body: {
          czar_id: czarId.value,
          user_id: playerId.value,
          room_id: roomId.value,
          submitted_cards: selectedCards,
        },
      },
    );

    if (error) {
      console.error("[EDGE] Error submitting white cards:", error);
      return;
    }

    const submittedIds = new Set(selectedCards.map((c: any) => c.id));
    playerHandCards.value = playerHandCards.value.filter(
      (handCard: any) => !submittedIds.has(handCard.id),
    );
    console.log(
      "Updated playerHandCards after submission: ",
      playerHandCards.value,
    );
    resetWhiteCardSelection();
    isWhiteCardsSubmitted.value = true;
    console.log("[EDGE] success submit_white_cards", data);
  });
};

const pickWinnerCard = (playerSubmission) => {
  if (!isCzar.value) return;
  pickWinnerSubmission(playerSubmission);
};

const chooseWinner = async () => {
  if (!isCzar.value) return;

  try {
    await submitWinnerSelection(async (selectedWinner) => {
      const chosenPlayerSubmission = selectedWinner[0];
      console.log("Selected winner: ", chosenPlayerSubmission);

      const { data, error } = await supabase.functions.invoke("select_winner", {
        method: "POST",
        body: {
          room_id: roomId.value,
          winner: chosenPlayerSubmission,
        },
      });

      if (error) {
        console.error("Error selecting winner:", error);
        return;
      }

      console.log("[EDGE] success select_winner", data);
      resetWinnerSelection();
    });
  } catch (error) {
    console.error("[EDGE] select_winner failed:", error);
  }
};

const nextRound = async () => {
  if (!isCzar.value) return;
  if (isStartingNextRound.value) return;
  isStartingNextRound.value = true;

  try {
    const { data, error } = await supabase.functions.invoke(
      "initialize_next_round",
      {
        method: "POST",
        body: {
          room_id: roomId.value,
        },
      },
    );

    if (error) {
      console.error("Error starting next round:", error);
    } else {
      console.log("[EDGE] success initialize_next_round", data);
      gameChannel.value.send({
        type: "broadcast",
        event: "cards_dealt",
      });
    }
  } finally {
    isStartingNextRound.value = false;
  }
};

const handleLeaveRoom = async () => {
  if (!roomId.value || !playerId.value) return;
  await leaveRoom(roomId.value, playerId.value);
};

// const leaveRoom = async () => {
//   const { error } = await supabase
//     .from("room_members")
//     .delete()
//     .eq("room_id", roomId.value)
//     .eq("user_id", playerId.value);

//   if (error) {
//     console.error("Error leaving room:", error);
//     return;
//   }

//   isLeaving.value = true;
//   await navigateTo("/");
// };

const markMemberInactive = async () => {
  if (!playerId.value || !roomId.value) return;
  await supabase
    .from("room_members")
    .update({ is_active: false, left_at: new Date().toISOString() })
    .eq("room_id", roomId.value)
    .eq("user_id", playerId.value);
};

onUnmounted(() => {
  if (!isLeaving.value) markMemberInactive();
  if (gameChannel.value) supabase.removeChannel(gameChannel.value);
});
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
            @click="handleLeaveRoom"
            class="px-6 py-4 rounded-full text-gray-500 border border-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50"
          >
            Leave
          </button>
        </div>
      </div>

      <!-- Player List -->
      <div class="flex flex-row px-4 overflow-x-auto gap-2">
        <div
          v-for="player in playersWithScores"
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
            <span class="">{{ player.score }}</span>
            <span class="text-[0.6rem] uppercase transition">{{
              getPlayerDisplayStatus(player)
            }}</span>
          </div>
        </div>
      </div>
    </section>

    <p v-if="authError" class="text-red-500 text-sm mb-4">{{ authError }}</p>
    <label
      class="mb-2 inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
    >
      <input
        v-model="enableBlackCardMinGapTest"
        type="checkbox"
        class="h-4 w-4"
      />
      Test mode: force at least 2 black-card gaps
    </label>
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

    <!-- Game Area -->
    <section
      v-if="gameStarted"
      class="w-full h-full flex flex-col gap-4 max-w-2xl"
    >
      <!-- Status Message -->
      <p class="bg-white p-2 text-blue-500 text-2xl text-center">
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
          <p class="text-2xl font-medium text-blue-700">
            {{
              winnerUsername
                ? `${winnerUsername} wins the round!`
                : "Couldn't determine winner."
            }}
          </p>
        </div>
        <div
          v-if="blackCard"
          class="relative h-64 w-52 rounded-lg bg-gray-900 p-6 text-lg font-bold text-white shadow-md"
        >
          <div>
            <span
              v-for="(part, index) in blackCardTextParts"
              :key="`black-card-${index}`"
            >
              <span
                v-if="part.isGap"
                @click="removeChosenWhiteCardAtGap(part.gapIndex)"
                :title="getChosenWhiteCardTextAtGap(part.gapIndex) || '•••'"
                class="mx-1 inline-flex h-8 w-24 min-w-24 items-center justify-center overflow-hidden rounded-md border border-white/40 bg-white/10 px-3 py-1 align-middle text-sm font-semibold text-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                :class="[
                  canEditChosenGaps &&
                  getChosenWhiteCardTextAtGap(part.gapIndex)
                    ? 'cursor-pointer hover:border-white/70 hover:bg-white/20'
                    : 'cursor-default',
                  getChosenWhiteCardTextAtGap(part.gapIndex)
                    ? 'tracking-normal'
                    : 'tracking-[0.35em] text-white/80',
                ]"
              >
                <span class="block w-full truncate text-center">
                  {{ getChosenWhiteCardTextAtGap(part.gapIndex) || "•••" }}
                </span>
              </span>
              <span v-else>{{ part.text }}</span>
            </span>
          </div>
        </div>
        <div v-if="roundStatus === 'round_end'" class="w-full p-4">
          <div
            class="flex flex-row items-center justify-start gap-4 bg-gray-100 p-4 rounded-lg transition-all"
          >
            <div
              v-for="(cardId, index) in winnerCards"
              :key="index"
              class="relative w-full min-h-48 max-w-36 rounded-lg shadow-lg bg-white p-3 font-medium text-sm transition-all"
            >
              {{ getCardTextById(cardId) }}
              <div class="absolute bottom-2 right-3 text-xs text-blue-500">
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
      <div
        v-if="roundStatus === 'round_submitted'"
        class="mx-1 overflow-x-auto overflow-y-visible px-1 pb-3 pt-1 [scrollbar-width:thin]"
      >
        <div
          class="flex w-max min-w-full flex-nowrap gap-4 snap-x snap-mandatory"
        >
          <template
            v-for="(playerSubmission, index) in submittedWhiteCards"
            :key="`${playerSubmission.id || index}`"
          >
            <div
              v-for="cardId in playerSubmission.metadata?.submitted_cards || []"
              :key="`${playerSubmission.id}-${cardId}`"
              @click="isCzar && pickWinnerCard(playerSubmission)"
              class="h-64 w-52 shrink-0 snap-start rounded-lg border border-gray-200 bg-white p-4 text-sm font-bold text-gray-800 shadow-sm transition-all"
              :class="[
                isCzar
                  ? 'cursor-pointer md:hover:-translate-y-1 md:hover:border-blue-300 md:hover:shadow-lg'
                  : 'cursor-default',
                isWinnerSubmissionSelected(playerSubmission)
                  ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                  : 'bg-white',
              ]"
            >
              {{ getCardTextById(cardId) }}
            </div>
          </template>
        </div>
      </div>

      <!-- Player Hand -->
      <div
        v-if="
          !isCzar &&
          roundStatus === 'round_start' &&
          isWhiteCardsSubmitted === false
        "
        class="fixed bottom- left-1/2 -translate-x-1/2"
      >
        <div
          class="relative h-[26rem] w-[46rem] max-w-[95vw] overflow-hidden"
          @wheel.prevent="handleHandScroll"
        >
          <div
            v-for="(card, index) in playerHandCards"
            :key="card.id"
            @click="chooseCard(card)"
            class="absolute h-64 w-52 cursor-pointer transition-all duration-200 ease-out"
            :style="handCardStyle(index)"
          >
            <div
              class="flex h-full w-full items-center justify-center rounded-2xl border border-gray-200 bg-white p-4 text-sm font-bold text-gray-800 shadow-md"
              :class="
                myChosenWhiteCards.some((c) => c.id === card.id)
                  ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                  : 'bg-white'
              "
            >
              <div class="text-center leading-5">
                {{
                  (collectionCards.data || []).find(
                    (c) => c.id === card.card_id,
                  )?.text || "Loading..."
                }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="gameStarted && isCzar && roundStatus === 'round_submitted'"
      class="fixed bottom-[max(env(safe-area-inset-top),1.5rem)] flex flex-col items-center gap-2 transition-all"
    >
      <p v-if="winnerPickError" class="text-red-500 text-sm">
        {{ winnerPickError }}
      </p>
      <button
        @click="chooseWinner"
        :disabled="isChoosingWinner"
        class="px-8 py-4 bg-blue-500 rounded-full text-white text-sm font-semibold rounded hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {{ isChoosingWinner ? "Choosing..." : "Choose" }}
      </button>
    </section>

    <!-- Waiting for game to start -->
    <section
      v-if="!isGameMaster && !gameStarted"
      class="bg-white rounded w-full max-w-2xl p-12 flex flex-col items-center justify-center"
    >
      <p class="text-blue-500">Waiting for the Game Master to start...</p>
    </section>

    <!-- Submit Button -->
    <section
      v-if="
        gameStarted &&
        !isCzar &&
        roundStatus === 'round_start' &&
        !isWhiteCardsSubmitted
      "
      class="fixed bottom-[max(env(safe-area-inset-top),1.5rem)] flex items-center transition-all"
    >
      <button
        @click="submitWhiteCards"
        :disabled="
          isSubmittingWhiteCards ||
          myChosenWhiteCards.length !== numberOfCardsToPlay
        "
        class="px-8 py-4 bg-blue-500 rounded-full text-white text-sm font-semibold rounded hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {{
          isSubmittingWhiteCards
            ? "Submitting..."
            : myChosenWhiteCards.length === numberOfCardsToPlay
              ? "Submit"
              : `${myChosenWhiteCards.length} / ${numberOfCardsToPlay} Cards`
        }}
      </button>
    </section>

    <!-- Start Game Button -->
    <section
      v-if="!gameStarted && isGameMaster"
      class="fixed bottom-[max(env(safe-area-inset-top),1.5rem)] flex items-center transition-all"
    >
      <button
        @click="startGame"
        :disabled="isStartingGame"
        class="px-8 py-4 bg-blue-500 rounded-full text-white text-sm font-semibold rounded hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {{ isStartingGame ? "Starting..." : "Start Game" }}
      </button>
    </section>

    <!-- Next Round Button -->
    <section
      v-if="roundStatus === 'round_end' && isCzar"
      class="fixed bottom-[max(env(safe-area-inset-top),1.5rem)] flex items-center transition-all"
    >
      <button
        @click="nextRound"
        :disabled="isStartingNextRound"
        class="px-8 py-4 bg-blue-500 rounded-full text-white text-sm font-semibold rounded hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {{ isStartingNextRound ? "Loading..." : "Next Round" }}
      </button>
    </section>
  </main>
</template>
