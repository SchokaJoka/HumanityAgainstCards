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

const gameModeInfoText: Record<"classic" | "creative", string> = {
  classic:
    "Play with preset cards. Pick white cards, the Czar judges, and points decide the winner.",
  creative:
    "No sets, no limits! Every player delivers their own funniest answer to the also self-written black card.",
};

const players = useState<any[]>("players", () => []);
const gameChannel = useState<RealtimeChannel | null>("gameChannel", () => null);

const collections = ref<any[]>([]);
const selectedCollectionIds = useState<string[]>('selectedCollectionIds', () => []);
const selectedGameMode = useState<"classic" | "creative">(
  "selectedGameMode",
  () => "classic",
);

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

  // Fall back to avatar-1 when metadata is missing/invalid.
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
const isLeavingFromBack = ref<boolean>(false);
const showGameInfoOverlay = ref(false);
const infoMode = ref<"classic" | "creative">("classic");
const isBackNavigationPending = computed(
  () => isLeavingFromBack.value || isLeaving.value,
);

const selectedInfoMode = computed(() =>
  gameModes.find((mode) => mode.value === infoMode.value),
);

function openGameModeInfo(mode: "classic" | "creative") {
  infoMode.value = mode;
  showGameInfoOverlay.value = true;
}

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
        title: "Humanitary Against Cards",
        text: `Join my game on Humanity Against Cards Online!\nUse the code: ${roomCode.value}`,
        url: window.location.href,
        
      });
    } catch (error) {
      console.error("Error sharing room code:", error);
    }
  } else {
    copyRoomCode();
  }
}

async function handleBackFromLobby() {
  if (isBackNavigationPending.value) {
    return;
  }

  isLeavingFromBack.value = true;
  if (roomId.value && playerId.value) {
    try {
      await deletePlayerFromRoomTable(roomId.value, playerId.value);
    } catch (err) {
      console.error("[Lobby] Failed to leave room from lobby header:", err);
    }
  }

  await navigateTo("/");
}

// ============================================================

// DEV DEBUGGING
// ============================================================
const dev2gaps = ref(false);
// ============================================================
</script>

<template>
  <main class="w-full flex items-center justify-center text-white bg-black">
    <!-- Header -->
    <header ref="headerEl" class="fixed top-0 w-full flex items-center justify-start p-4 bg-black z-40">
      <div class="w-full flex flex-row gap-4 items-center">
        <div class="cursor-pointer" :class="{ 'pointer-events-none opacity-70': isBackNavigationPending }"
          @click="handleBackFromLobby()">
          <svg v-if="isBackNavigationPending" class="h-8 w-10 animate-spin" viewBox="0 0 24 24" fill="none"
            xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="white" stroke-width="2" opacity="0.3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="white" stroke-width="2" stroke-linecap="round" />
          </svg>
          <img v-else src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
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
      <div class="flex flex-col gap-2 w-full ">
        <GameModeSelectionCard v-for="mode in gameModes" :key="mode.value" :mode="mode.value" :title="mode.title"
          :description="mode.description" :selected-mode="selectedGameMode" :can-select="isGameMaster"
          :collections="collections" :selected-collection-ids="selectedCollectionIds" @select="setLobbySettings"
          @select-collection="setSelectedCollection" @info="openGameModeInfo" :show-arrow-icon="mode.value !== 'creative'"
          class="rounded-lg overflow-hidden" />
      </div>
    </main>

    <div v-if="showGameInfoOverlay" class="fixed inset-0 z-50 bg-black/40" @click="showGameInfoOverlay = false">
      <div class="absolute inset-0 flex items-center justify-center p-8">
        <div class="bg-white text-black flex flex-col rounded p-6 w-full max-w-xs" @click.stop>
          <p class="font-bold text-2xl">{{ selectedInfoMode?.title || "Game Mode" }}</p>
          <p class="mt-3 text-lg leading-relaxed">
            {{ gameModeInfoText[infoMode] }}
          </p>
          <div class="mt-4 flex flex-row justify-end w-full gap-4">
            <Button size="md" variant="secondary" class="rounded" @click="showGameInfoOverlay = false">Ok</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <!-- Player List, Room Info -->
    <footer ref="footerEl"
      class="fixed bottom-[env(safe-area-inset-bottom,0px)] bg-black w-full flex items-center justify-center">
      <div class="flex flex-col items-center justify-between min-h-lg w-full max-w-2xl px-8 pb-4 pt-1 gap-2 z-40">
        <div v-if="errorMessage" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {{ errorMessage }}
        </div>
        <!-- Player List -->
        <section class="flex flex-row w-full overflow-x-auto gap-2">
          <div v-for="player in players" :key="player.user_id"
            class="flex flex-col gap-2 items-center transition-all border-black">
            <div class="flex items-center justify-center size-12 rounded-full border-2 bg-white transition-all" :class="gameMasterId === player.user_id
              ? 'border-black'
              : 'border-black'
              ">
              <img :src="getAvatarSrc(player.metadata?.avatar_url)" alt="Player avatar"
                class="size-10 rounded-full object-cover" />

            </div>
            <span class="text-xs font-semibold transition">
              {{ player.user_id === playerId ? 'You' : player.user_name }}
            </span>
          </div>
        </section>

        <!-- Start Game Button -->
        <section class="flex flew-row items-stretch w-full transition-all justify-between gap-4">
          <div class="flex flex-col gap-2 w-full">
            <div class="flex flex-row gap-2  items-stretch h-fit overflow-clip border-[3px]  border-white">
              <div class="w-full flex flex-row items-center justify-between cursor-pointer">
                <div class="w-full flex flex-row py-4 px-3 text-xl font-normal items-center justify-between"
                  @click="copyRoomCode()">
                  <Transition name="copy-swap" mode="out-in">
                    <div :key="isRoomCodeCopied ? 'copied' : 'room-code'" class="inline-block">
                      {{ isRoomCodeCopied ? "Copied!" : roomCode.trim().toUpperCase() }}
                    </div>
                  </Transition>
                  <img src="~/assets/svg/copy.svg" alt="Copy room code" class="h-7 w-7" />
                </div>

                <div class="flex flex-row items-center h-full">
                  <div @click="shareRoomCode()" class="flex items-center px-4 bg-white h-full">
                    <img src="~/assets/svg/link.svg" alt="Share room code" class="h-10 w-10" />
                  </div>

                </div>
              </div>
            </div>
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

.copy-swap-enter-active,
.copy-swap-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.copy-swap-enter-from,
.copy-swap-leave-to {
  opacity: 0.5;
  transform: scale(0.98);
}

.copy-swap-enter-to,
.copy-swap-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
