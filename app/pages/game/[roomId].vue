<script setup lang="ts">
import { useCards } from "~/composables/useCards";
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

let gameChannel = ref<RealtimeChannel | null>(null);
const gameState = ref({});
const roundStatus = ref("lobby");

const gameStarted = ref(false);

const collectionCards = ref<any>({});
const playerHandCards = ref([]);
const blackCard = ref({});
const myChosenWhiteCards = ref<any[]>([]);
const submittedWhiteCards = ref<any[]>([]);
const isWhiteCardsSubmitted = ref(false);

const winnerUsername = ref(null);
const winnerCards = ref(null);

const isLeaving = ref(false);
const authError = ref("");

// First player in join order acts as game master.
const gameMasterId = computed(() => {
  const firstPlayer = players.value[0];
  return firstPlayer?.user_id ?? null;
});

// True when this client is the current game master.
const isGameMaster = computed(() => {
  return !!playerId.value && playerId.value === gameMasterId.value;
});

// User id of the active czar for the current round.
const czarId = computed(() => {
  if (gameStarted.value) {
    return gameState.value.czar_id ?? null;
  }
  return null;
});

// True when this client is the active czar.
const isCzar = computed(() => {
  return !!playerId.value && playerId.value === czarId.value;
});

const numberOfCardsToPlay = computed(() => {
  if (!blackCard.value) return null;
  if (blackCard.value.number_of_gaps === null) {
    console.warn("Black card missing number_of_gaps:", blackCard.value);
    return null;
  }
  if (blackCard.value.number_of_gaps === 0) return 1; // If 0, card is a question. 1 card must be played.
  return blackCard.value.number_of_gaps;
});

const availableCollectionCards = computed(() => {
  if (Array.isArray(collectionCards.value?.data))
    return collectionCards.value.data;
  if (Array.isArray(collectionCards.value)) return collectionCards.value;
  return [];
});

const GAP_TOKEN = "[[W1tnYXBdXQ==]]";

type TextPart = {
  text: string;
  isGap: boolean;
};

const getCardTextById = (cardId: string) => {
  const card = availableCollectionCards.value.find((c: any) => c.id === cardId);
  return card?.text || "Unknown card";
};

const getTextParts = (text: string): TextPart[] => {
  if (!text.includes(GAP_TOKEN)) {
    return [{ text, isGap: false }];
  }

  return text
    .split(GAP_TOKEN)
    .flatMap((part: string, index: number, parts: string[]) =>
      index < parts.length - 1
        ? [
          { text: part, isGap: false },
          { text: "", isGap: true },
        ]
        : [{ text: part, isGap: false }],
    );
};

const blackCardTextParts = computed(() => {
  const text = typeof (blackCard.value as any)?.text === "string"
    ? (blackCard.value as any).text
    : "";

  return getTextParts(text);
});

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

const round = computed(() => {
  if (!gameState.value.round) return null;
  return gameState.value.round;
});

onMounted(async () => {
  // Look up the room by code and get its ID
  // ===============================================================
  const { data: roomData } = await supabase
    .from("rooms")
    .select("id, code, metadata")
    .eq("code", roomCode)
    .maybeSingle();

  if (!roomData) {
    authError.value = "Room does not exist.";
    return;
  }

  roomId.value = roomData.id;
  // ===============================================================

  // Authentication
  // ===============================================================
  if (!user.value) {
    navigateTo("/login?redirect=joinGame&roomCode=" + roomCode);
  } else {
    playerId.value = user.value.sub;
  }
  // ===============================================================

  // Add player to room_members table (or mark active if rejoining)
  // ===============================================================
  if (!playerId.value || !roomId.value) {
    authError.value = "Missing player or room ID.";
    return;
  }

  const { error } = await supabase.from("room_members").upsert(
    {
      room_id: roomId.value,
      user_id: playerId.value,
      role: "player",
      is_active: true,
      left_at: null,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "room_id,user_id" },
  );

  if (error) {
    authError.value = "Failed to join room.";
    console.error("Error joining room:", error);
    return;
  }
  // ===============================================================

  // Join the realtime channel for this room by room ID
  // ===============================================================
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
      await gameChannel.value.track({
        user_id: playerId.value,
        user_name: user.value.user_metadata.full_name || "Guest",
        status: "playing",
        joined_at: Date.now(),
      });
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

  const { data, error } = await supabase
    .from("room_members")
    .select("status")
    .eq("room_id", roomId.value)
    .eq("user_id", playerId.value)

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
  myChosenWhiteCards.value = [];

  submittedWhiteCards.value = data ?? [];
  console.log("submittedWhiteCards: ", submittedWhiteCards.value);
}

async function handleRoundEnd(currentMetaData: object) {
  const winnerId = currentMetaData.current_winner.user_id;
  winnerUsername.value = players.value.find((p) => p.user_id === winnerId)?.user_name || null;
  winnerCards.value = currentMetaData.current_winner.metadata?.submitted_cards || null;
}

const chooseCard = async (card) => {
  if (isCzar.value) return;

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
};

const submitWhiteCards = async () => {
  if (myChosenWhiteCards.value.length === numberOfCardsToPlay.value) {
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
      console.log("Updated playerHandCards after submission: ", playerHandCards.value);
      myChosenWhiteCards.value = [];

      isWhiteCardsSubmitted.value = true;

      console.log("[EDGE] success submit_white_cards");
    }
  } else {
    console.warn(
      `${numberOfCardsToPlay.value} card(s) need to be submitted!`,
    );
  }
};

async function selectWinner(chosenPlayerSubmittion) {
  if (!isCzar.value) return;

  console.log("Selected winner: ", chosenPlayerSubmittion);

  const { data, error } = await supabase.functions.invoke("select_winner", {
    method: "POST",
    body: {
      room_id: roomId.value,
      winner: chosenPlayerSubmittion,
    },
  });

  if (error) {
    console.error("Error selecting winner:", error);
  } else {
    console.log("[EDGE] success select_winner", data);
  }
}

const nextRound = async () => {
  if (!isGameMaster.value) return;

  const { data, error } = await supabase.functions.invoke("initialize_next_round", {
    method: "POST",
    body: {
      room_id: roomId.value,
    },
  });

  if (error) {
    console.error("Error starting next round:", error);
  } else {
    console.log("[EDGE] success initialize_next_round", data);
    gameChannel.value.send({
      type: "broadcast",
      event: "cards_dealt",
    });
  }
};

const leaveRoom = async () => {
  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId.value)
    .eq("user_id", playerId.value);

  if (error) {
    console.error("Error leaving room:", error);
    return;
  }

  isLeaving.value = true;
  await navigateTo("/");
};

const markMemberInactive = async () => {
  if (!playerId.value || !roomId.value) return;
  await supabase
    .from("room_members")
    .update({ is_active: false, left_at: new Date().toISOString() })
    .eq("room_id", roomId.value)
    .eq("user_id", playerId.value);
};

const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

onUnmounted(() => {
  if (!isLeaving.value) markMemberInactive();
  if (gameChannel.value) supabase.removeChannel(gameChannel.value);
});
</script>

<template>
  <main class="flex flex-col items-center min-h-screen scroll-x-">
    <!-- Lobby Info Section -->
    <section class="w-full max-w-svw h-fit mb-2 overflow-x-visible pt-[max(env(safe-area-inset-top),1.5rem)]">
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
          <button @click="leaveRoom"
            class="px-6 py-4 rounded-full text-gray-500 border border-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50">
            Leave
          </button>
        </div>
      </div>

      <!-- Player List -->
      <div class="flex flex-row px-4 overflow-x-auto gap-2">
        <div v-for="player in playersWithScores" :key="player.user_id"
          class="flex flex-row items-center gap-2 min-w-24 rounded-xl pl-2 pr-4 py-2 text-xs font-medium bg-gray-50"
          :class="czarId === player.user_id
            ? 'border-2 border-blue-200 text-blue-700'
            : 'text-gray-600'
            ">
          <!-- <div
            class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold hover:bg-blue-600 transition"
            :title="`${user?.user_metadata?.full_name || 'Profile'}`">
            {{ getInitials(player.user_name) }}
          </div> -->
          <div>
            <p class="text-md font-bold text-gray-600">{{ player.user_name }}</p>
            <!-- <p v-if="czarId === player.user_id" class="font-bold">CZAR</p> -->
            <p class="text-gray-400">{{ player.score }}</p>
          </div>
        </div>
      </div>
    </section>

    <p v-if="authError" class="text-red-500 text-sm mb-4">{{ authError }}</p>

    <!-- Game Area -->
    <section v-if="gameStarted" class="w-full max-w-2xl">

      <!-- Status Message -->
      <div class="bg-white rounded p-2 text-blue-500 text-2xl text-center">
        <p v-if="roundStatus === 'round_start'" class="font-medium">
          {{
            isCzar
              ? "Waiting for players to pick..."
              : isWhiteCardsSubmitted
                ? "Waiting for others..."
                : "Pick a white card!"
          }}
        </p>
        <p v-if="roundStatus === 'round_submit'" class="font-medium">
          {{ isCzar ? "Pick the winner!" : "The Czar is judging..." }}
        </p>
      </div>

      <!-- Black Card -->
      <div class="flex flex-col items-center justify-center gap-4">
        <div v-if="roundStatus === 'round_end'" class="space-y-3">
          <p class="text-2xl font-medium text-blue-700">
            {{ winnerUsername ? `${winnerUsername} wins the round!` : "Couldn't determine winner." }}
          </p>
        </div>
        <div v-if="blackCard"
          class="relative h-64 w-52 rounded-lg bg-gray-900 p-6 text-lg font-bold text-white shadow-md">
          <div>
            <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`">
              <span v-if="part.isGap"
                class="mx-1 inline-flex min-w-20 items-center justify-center rounded-md border border-white/40 bg-white/10 px-3 py-1 align-middle text-sm font-semibold tracking-[0.35em] text-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                •••
              </span>
              <span v-else>{{ part.text }}</span>
            </span>
          </div>
        </div>
        <div v-if="roundStatus === 'round_end'" class="space-y-3">

          <div class="h-64 w-48 rounded border-2 bg-white p-4 font-bold shadow-md transition-all">
            <div v-for="cardId in winnerCards" class="mb-2 rounded bg-gray-50 p-2 text-sm">
              {{ getCardTextById(cardId) }}
            </div>
          </div>
          <button v-if="isGameMaster" @click="nextRound"
            class="px-6 py-2 bg-blue-500 text-white font-semibold rounded hover:bg-blue-600">
            Next Round
          </button>
        </div>
      </div>



      <!-- Judging Area -->
      <div v-if="roundStatus === 'round_submitted'" class="flex flex-wrap justify-center gap-4">
        <div v-for="playerSubmission in submittedWhiteCards" :key="playerSubmission.id"
          @click="isCzar && selectWinner(playerSubmission)"
          class="h-64 w-48 rounded border-2 bg-white p-4 font-bold shadow-md transition-all" :class="winnerUsername?.winnerId === playerSubmission.user_id
            ? 'border-green-500 bg-green-50'
            : isCzar
              ? 'cursor-pointer border-gray-200 hover:-translate-y-2 hover:border-blue-400'
              : 'cursor-default border-gray-200'
            ">
          <div v-for="cardId in playerSubmission.metadata?.submitted_cards || []"
            :key="`${playerSubmission.id}-${cardId}`" class="mb-2 rounded bg-gray-50 p-2 text-sm">
            {{ getCardTextById(cardId) }}
          </div>
        </div>
      </div>

      <!-- Player Hand -->
      <div v-if="!isCzar && roundStatus === 'round_start' && isWhiteCardsSubmitted === false" class="mt-6">
        <div class="mx-1 overflow-x-auto overflow-y-visible px-1 pb-3 pt-1 [scrollbar-width:thin]">
          <div class="flex w-max min-w-full flex-nowrap gap-4 snap-x snap-mandatory">
            <div v-for="card in playerHandCards" :key="card.id" @click="chooseCard(card)"
              class="h-64 w-52 shrink-0 snap-start cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-sm font-bold text-gray-800 shadow-sm transition-all md:hover:-translate-y-1 md:hover:border-blue-300 md:hover:shadow-lg"
              :class="myChosenWhiteCards.some((c) => c.id === card.id)
                ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                : 'bg-white'
                ">
              {{
                (collectionCards.data || []).find((c) => c.id === card.card_id)
                  ?.text || "Loading..."
              }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Waiting for game to start -->
    <section v-else class="bg-white rounded shadow-md w-full max-w-2xl p-12 flex flex-col items-center justify-center">
      <p class="text-gray-500">Waiting for the Game Master to start...</p>
    </section>

    <!-- Submit Button -->
    <section v-if="gameStarted && !isCzar && roundStatus === 'round_start' && !isWhiteCardsSubmitted"
      class="fixed bottom-8 flex items-center space-x-4">
      <button @click="submitWhiteCards"
        class="px-8 py-4 bg-blue-500 rounded-full text-white text-sm font-semibold rounded hover:bg-blue-600">
        Submit
      </button>
    </section>

    <!-- Start Game Button -->
    <section v-if="!gameStarted && isGameMaster" class="fixed bottom-8 flex items-center space-x-4">
      <button @click="startGame"
        class="px-8 py-4 bg-blue-500 rounded-full text-white text-sm font-semibold rounded hover:bg-blue-600">
        Start Game
      </button>
    </section>
  </main>
</template>
