<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";

// VARIABLES
// ============================================================
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const isRoomNavigation = useState<boolean>("isRoomNavigation", () => false);

const route = useRoute();
const roomId = ref<string | null>(null);
const playerId = useState<string | null>("playerId", () => null);
const gameMasterId = useState<string | null>("gameMasterId", () => null);
const isGameMaster = useState<boolean>("isGameMaster", () => false);

const roomCode = ref<string>("");

const gameModes: Array<{
  value: "classic" | "creative";
  title: string;
  description: string;
}> = [
    {
      value: "classic",
      title: "Classic",
      description: "The epic game just as you know it.",
    },
    {
      value: "creative",
      title: "Creative Mode",
      description: "Write ALL your own cards. Yes, even the black ones.",
    },
  ];

const players = useState<any[]>("players", () => []);
const gameChannel = useState<RealtimeChannel | null>("gameChannel", () => null);

const collections = ref<any[]>([]);
const selectedCollectionIds = useState<string[]>('selectedCollectionIds', () => []);
const selectedGameMode = useState<"classic" | "creative">(
  "selectedGameMode",
  () => "classic",
);

// ============================================================

// COMPOSABLES
// ============================================================
const { headerEl } = useHeaderHeight();
const { headerEl: footerEl } = useHeaderHeight("--lobby-footer-h");
const {
  // Variables
  isLeaving,

  // Functions
  getRoomIdByCode,
  enterRoom,
  joinRoom,
  deletePlayerFromRoomTable,
  markMemberInactive,
  setupBroadcastListeners,
  ensureChannelSubscribed,
  leaveRoomRealtime,
} = useRoom();

const {
  // Variables
  errorMessage,
  isStartingGame,
  // Functions
  initializeGame,
} = useGameManager();

const { getCardCollections } = useCards();
// ============================================================

// Auto-clear error messages after 3000ms
let errorClearTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => errorMessage.value,
  (next) => {
    if (errorClearTimer) {
      clearTimeout(errorClearTimer);
      errorClearTimer = null;
    }
    if (next) {
      errorClearTimer = setTimeout(() => {
        errorMessage.value = null;
        errorClearTimer = null;
      }, 3000);
    }
  },
);

// COMPUTED PROPERTIES
// ============================================================

// Watch for changes to playerId or gameMasterId and update isGameMaster
watch([playerId, gameMasterId], ([newPlayerId, newGameMasterId]) => {
  isGameMaster.value = !!newPlayerId && newGameMasterId === newPlayerId;
});

// Clear error message when lobby reaches minimum players
watch(players, (next) => {
  if ((next ?? []).length >= 2 && errorMessage.value) {
    errorMessage.value = null;
  }
});
// ============================================================

// FUNCTIONS
// ============================================================
async function startGame() {
  if (!roomId.value || !roomCode.value) {
    console.error("[Lobby] startGame aborted - missing roomId or roomCode");
    return;
  }
  if ((players.value ?? []).length < 2) {
    errorMessage.value = "At least 2 players are required to start the game.";
    return;
  }

  const offlinePlayers = (players.value ?? []).filter(
    (p: any) => p.is_active !== false && !p.is_online,
  );
  if (offlinePlayers.length > 0) {
    errorMessage.value = "Waiting for all players to rejoin; cannot start yet.";
    return;
  }

  isRoomNavigation.value = true;
  if (selectedGameMode.value === "creative") {
    const ok = await initializeGame(roomId.value, roomCode.value, dev2gaps.value, null, selectedGameMode.value);
    if (ok) {
      navigateTo(`/play/${roomCode.value}/game/${selectedGameMode.value}`);
    } else {
      isRoomNavigation.value = false;
    }
    return;
  } else {
    if (!selectedCollectionIds.value || selectedCollectionIds.value.length === 0) {
      errorMessage.value = "Please select at least one card set to start.";
      console.error("[Lobby] startGame aborted - missing collectionId(s)");
      isRoomNavigation.value = false;
      return;
    }
    const ok = await initializeGame(
      roomId.value,
      roomCode.value,
      dev2gaps.value,
      selectedCollectionIds.value,
      selectedGameMode.value,
    );
    if (ok) {
      navigateTo(`/play/${roomCode.value}/game/${selectedGameMode.value}`);
    } else {
      isRoomNavigation.value = false;
    }
  }
}

async function setLobbySettings(newVal: "classic" | "creative") {
  selectedGameMode.value = newVal;

  const { data: roomRow, error: roomErr } = await supabase
    .from("rooms")
    .select("metadata")
    .eq("id", roomId.value)
    .single();

  if (roomErr) {
    console.warn("[Lobby] Failed to load room metadata for mode update:", roomErr);
    return;
  }

  const metadata = (roomRow?.metadata ?? {}) as Record<string, any>;
  const { error: updateErr } = await supabase
    .from("rooms")
    .update({ metadata: { ...metadata, mode: newVal } })
    .eq("id", roomId.value);

  if (updateErr) {
    console.warn("[Lobby] Failed to persist mode change:", updateErr);
  }



  await gameChannel.value?.send({
    type: "broadcast",
    event: "lobby_settings_updated",
    payload: {
      selectedGameMode: newVal,
    },
  });
}

function setSelectedCollection(collectionId: string) {
  // Toggle selection of a collection (allow combining multiple sets)
  selectedCollectionIds.value = selectedCollectionIds.value.includes(collectionId)
    ? selectedCollectionIds.value.filter(c => c !== collectionId)
    : [...selectedCollectionIds.value, collectionId];
}
// ============================================================

// onMounted, onUnmounted
// ============================================================
onMounted(async () => {
  isRoomNavigation.value = false;
  // Extract room code from route
  roomCode.value = String(route.params.roomCode ?? "").toUpperCase();

  roomId.value = await getRoomIdByCode(roomCode.value);

  if (!roomId.value) {
    console.error("Missing room ID");
    return;
  }

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
  gameMasterId.value = room?.owner ?? null;

  const joined = await enterRoom(roomId.value, roomCode.value, playerId.value);
  if (!joined) {
    errorMessage.value = "Game has already started. You cannot join this room.";
    return;
  }

  const { data: roomMetaRow } = await supabase
    .from("rooms")
    .select("metadata")
    .eq("id", roomId.value)
    .single();
  if (roomMetaRow?.metadata?.mode) {
    selectedGameMode.value = roomMetaRow.metadata.mode;
  }

  collections.value = await getCardCollections();
  if (collections.value.length > 0) {
    // Force default selection to "Cards Against Humanity" when entering lobby
    const cah = collections.value.find((c: any) => (c.name || "").trim().toLowerCase() === "cards against humanity");
    if (cah) {
      selectedCollectionIds.value = [cah.id];
    } else if (selectedCollectionIds.value.length === 0) {
      selectedCollectionIds.value = [collections.value[0].id];
    }
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
  if (!isRoomNavigation.value) {
    if (!isLeaving.value && roomId.value && playerId.value) {
      await markMemberInactive(roomId.value, playerId.value);
    }

    console.info("[Lobby] Unmounted, performing cleanup");
    await leaveRoomRealtime();

    gameMasterId.value = null;
    playerId.value = null;
    isGameMaster.value = false;
    roomId.value = null;
  }
});
// ============================================================
// UTILITIES
// ============================================================
const isRoomCodeCopied = ref<boolean>(false);

async function copyRoomCode() {
  navigator.clipboard
    .writeText(roomCode.value)
    .then(() => {
      isRoomCodeCopied.value = true;
      setTimeout(() => {
        isRoomCodeCopied.value = false;
      }, 2000);
    })
    .catch((err) => {
      console.error("Failed to copy room code: ", err);
    });
}

async function shareRoomCode() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Join my game room on Cards Against Humanity Online!",
        text: `Join my game room on Cards Against Humanity Online! Use the code: ${roomCode.value}`,
        url: window.location.href,
      });
    } catch (error) {
      console.error("Error sharing room code:", error);
    }
  } else {
    copyRoomCode();
  }
}

function handleBackFromLobby() {
  if (roomId.value && playerId.value) {
    deletePlayerFromRoomTable(roomId.value, playerId.value);
    return;
  }
  navigateTo('/');
}

// ============================================================

// DEV DEBUGGING
// ============================================================
const dev2gaps = ref(true);
// ============================================================
</script>

<template>
  <main class="w-full flex items-center justify-center text-white bg-black">
    <!-- Header -->
    <header ref="headerEl" class="fixed top-0 w-full flex items-center justify-start p-4 bg-black z-40">
      <div class="w-full flex flex-row gap-4 items-center">
        <div class="cursor-pointer" @click="handleBackFromLobby()">
          <img src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
        </div>
        <p class="w-full text-4xl font-bold">
          Create Game
        </p>

      </div>
    </header>

    <!-- Main Content -->
    <main
      class="relative flex flex-col items-center justify-start w-full max-w-2xl px-8 pt-4 gap-4 mt-[var(--sets-header-h)]"
      :style="{
        minHeight:
          'calc(100dvh - var(--sets-header-h, 0px) - var(--lobby-footer-h, 0px))',
        paddingBottom: 'calc(var(--lobby-footer-h, 0px) + env(safe-area-inset-bottom, 0px))',
      }">
      <!-- Game Mode Selection -->
      <div class="flex flex-col gap-2 w-full">
        <GameModeSelectionCard v-for="mode in gameModes" :key="mode.value" :mode="mode.value" :title="mode.title"
          :description="mode.description" :selected-mode="selectedGameMode" :can-select="isGameMaster"
          :collections="collections" :selected-collection-ids="selectedCollectionIds" @select="setLobbySettings"
          @select-collection="setSelectedCollection" :show-arrow-icon="mode.value !== 'creative'" />
      </div>
    </main>

    <!-- Footer -->
    <!-- Player List, Room Info -->
    <footer ref="footerEl"
      class="fixed bottom-[env(safe-area-inset-bottom,0px)] bg-black w-full flex items-center justify-center">
      <div class="flex flex-col items-center justify-between min-h-lg w-full max-w-2xl px-8 pb-4 pt-1 gap-2 z-40">
        <div v-if="errorMessage" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {{ errorMessage }}
        </div>
        <!-- Player List -->
        <section class="flex flex-row w-full overflow-x-auto gap-4">
          <div v-for="player in players" :key="player.user_id"
            class="flex flex-col gap-2 items-center transition-all border-black">
            <div class="flex items-center justify-center size-12 rounded-full border-2 bg-white transition-all" :class="gameMasterId === player.user_id
              ? 'border-black'
              : 'border-black'
              ">
              <img src="https://placehold.co/40" alt="Player avatar" class="size-10 rounded-full object-cover" />

            </div>
            <span class="text-xs font-semibold transition">
              {{ player.user_id === playerId ? 'You' : player.user_name }}
            </span>
          </div>
        </section>

        <!-- Start Game Button -->
        <section class="flex flew-row items-stretch w-full transition-all justify-between gap-4">
          <div class="flex flex-col gap-2 w-full">
            <div class="flex flex-row gap-2 items-stretch h-fit overflow-clip border-[3px] border-white">
              <div class="w-full flex flex-row items-center justify-between cursor-pointer">
                <div class="w-full py-4 px-4 text-xl font-normal" @click="copyRoomCode()">
                  {{ roomCode.trim().toUpperCase() }}
                </div>

                <div class="flex flex-row items-center h-full">
                  <div @click="copyRoomCode()" class="flex items-center px-4 h-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M18.4903 3.46692H4.62256V18.4903" stroke="white" stroke-width="2" stroke-linecap="round"
                        stroke-linejoin="round" />
                      <path
                        d="M9.24512 8.08948H23.1128V21.9572C23.1128 22.5702 22.8693 23.1581 22.4359 23.5915C22.0024 24.025 21.4145 24.2685 20.8015 24.2685H11.5564C10.9434 24.2685 10.3555 24.025 9.92208 23.5915C9.48863 23.1581 9.24512 22.5702 9.24512 21.9572V8.08948Z"
                        stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </div>
                  <div @click="shareRoomCode()" class="flex items-center px-4 bg-white h-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path
                        d="M15.0234 6.93387L17.3347 4.62259C18.4903 3.46695 20.8016 3.46695 21.9572 4.62259L23.1129 5.77823C24.2685 6.93387 24.2685 9.24516 23.1129 10.4008L17.3347 16.179C16.179 17.3347 13.8677 17.3347 12.7121 16.179M12.7121 20.8016L10.4008 23.1129C9.24516 24.2685 6.93387 24.2685 5.77823 23.1129L4.62259 21.9572C3.46695 20.8016 3.46695 18.4903 4.62259 17.3347L10.4008 11.5564C11.5564 10.4008 13.8677 10.4008 15.0234 11.5564"
                        stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </div>

                </div>
              </div>
            </div>
            <!-- Copy Flyout -->
            <Transition name="fade-slide">
              <div v-if="isRoomCodeCopied"
                class="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black px-6 py-4 rounded-lg text-sm font-medium whitespace-nowrap">
                Copied to clipboard!
              </div>
            </Transition>
          </div>
          <Button v-if="isGameMaster" @click="startGame()" :disabled="isStartingGame" variant="primary" size="md"
            class="">Start</Button>
        </section>

      </div>
    </footer>

  </main>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translate(-50%, 10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}

.fade-slide-enter-to,
.fade-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
