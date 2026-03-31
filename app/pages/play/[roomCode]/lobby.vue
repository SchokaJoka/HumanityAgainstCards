<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";

// VARIABLES
// ============================================================
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const isJoiningGame = ref(false);

const route = useRoute();
const roomId = ref<string | null>(null);
const playerId = ref<string>("");
const gameMasterId = useState<string | null>("gameMasterId", () => null);
const isGameMaster = useState<boolean>("isGameMaster", () => false);

const roomCode = ref<string>("");

const players = useState<any[]>("players", () => []);
const gameChannel = useState<RealtimeChannel | null>("gameChannel", () => null);

const collections = ref<any[]>([]);
const selectedCollectionId = ref<string | null>(null);

// ============================================================

// COMPOSABLES
// ============================================================
const {
  // Variables
  isLeaving,

  // Functions
  getRoomIdByCode,
  enterRoom,
  joinRoom,
  deletePlayerFromRoomTable,
  insertPlayerInRoomTable,
  markMemberInactive,
  trackMyStatus,
  setupBroadcastListeners,
  leaveRoomRealtime,
} = useRoom();

const {
  // Variables
  errorMessage,
  // Functions
  initializeGame,
} = useGameManager();

const { getCardCollections } = useCards();
// ============================================================

// COMPUTED PROPERTIES
// ============================================================

// Watch for changes to playerId or gameMasterId and update isGameMaster
watch([playerId, gameMasterId], ([newPlayerId, newGameMasterId]) => {
  isGameMaster.value = !!newPlayerId && newGameMasterId === newPlayerId;
});
// ============================================================

// FUNCTIONS
// ============================================================
async function startGame() {
  if (!roomId.value || !roomCode.value) {
    console.log("[Lobby] startGame aborted - missing roomId or roomCode");
    return;
  }
  await initializeGame(roomId.value, roomCode.value, dev2gaps.value, selectedCollectionId.value);
  navigateTo(`/play/${roomCode.value}/game/${selectedGameMode.value}`);
}
// ============================================================

// onMounted, onUnmounted
// ============================================================
onMounted(async () => {
  // Extract room code from route
  roomCode.value = String(route.params.roomCode ?? "").toUpperCase();
  console.log("[Lobby] Extracted roomCode from route:", roomCode.value);

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
  console.log("Game master ID from DB:", gameMasterId.value);

  await enterRoom(roomId.value, roomCode.value, playerId.value, null);

  // Listen for navigate_to_game broadcast to transition to game.vue
  gameChannel.value?.on("broadcast", { event: "navigate_to_game" }, (payload: any) => {
    isJoiningGame.value = true;
    console.log("[BROADCAST] navigate_to_game:", payload);
    navigateTo(`/play/${payload.payload.roomCode}/game`);
  });

  collections.value = await getCardCollections();
});

onBeforeRouteLeave((to) => {
  // If moving within the same room flow, preserve the channel
  if (to.params.roomCode === route.params.roomCode) {
    isJoiningGame.value = true;
  }
});

onUnmounted(async () => {
  if (!isLeaving.value && roomId.value) await markMemberInactive(roomId.value, playerId.value);

  if (isJoiningGame.value) {
    console.log("[Lobby] Unmounted while joining game, skipping cleanup");
  } else {
    console.log("[Lobby] Unmounted, performing cleanup");
    await leaveRoomRealtime();
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
    })
    .catch((err) => {
      console.error("Failed to copy room code: ", err);
    });
}

// ============================================================

// DEV DEBUGGING
// ============================================================
const dev2gaps = ref(false);
const selectedGameMode = ref<"classic" | "extended" | "creative">("classic");
// ============================================================
</script>

<template>
  <main class="w-full flex items-center justify-center">
    <!-- Header -->
    <header class="fixed top-0 w-full flex items-center justify-start p-4 bg-white z-40">
      <div class="cursor-pointer" @click="roomId && deletePlayerFromRoomTable(roomId, playerId)">
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
      <div @click="isGameMaster && (selectedGameMode = 'classic')" :class="[
        'w-full rounded-lg flex flex-row items-stretch justify-between p-5 transition-all',
        selectedGameMode === 'classic'
          ? 'bg-black text-white border-2 border-black'
          : 'bg-neutral-200 text-black hover:bg-neutral-300',
        !isGameMaster && 'cursor-not-allowed opacity-50',
        isGameMaster && 'cursor-pointer'
      ]">
        <div class="flex flex-col gap-1 w-full">
          <p class="text-3xl font-semibold">Classic</p>
          <p class="text-sm font-normal">The epic game just as you know it.</p>
        </div>
        <div class="flex justify-center items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="23" viewBox="0 0 12 23" fill="none">
            <path fill-rule="evenodd" clip-rule="evenodd"
              d="M8.14441 11.2896L1.49204 4.63721L2.82233 3.30692L10.1398 10.6244C10.3162 10.8009 10.4153 11.0401 10.4153 11.2896C10.4153 11.539 10.3162 11.7783 10.1398 11.9547L2.82233 19.2722L1.49204 17.9419L8.14441 11.2896Z"
              :fill="selectedGameMode === 'classic' ? 'white' : 'black'" />
          </svg>
        </div>
      </div>
      <div @click="isGameMaster && (selectedGameMode = 'extended')" :class="[
        'w-full rounded-lg flex flex-row items-stretch justify-between p-5 transition-all',
        selectedGameMode === 'extended'
          ? 'bg-black text-white border-2 border-black'
          : 'bg-neutral-200 text-black hover:bg-neutral-300',
        !isGameMaster && 'cursor-not-allowed opacity-50',
        isGameMaster && 'cursor-pointer'
      ]">
        <div class="flex flex-col gap-1 w-full">
          <p class="text-3xl font-semibold">Extended</p>
          <p class="text-sm font-normal">Spice up your usual game with some jokers.</p>
        </div>
        <div class="flex justify-center items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="23" viewBox="0 0 12 23" fill="none">
            <path fill-rule="evenodd" clip-rule="evenodd"
              d="M8.14441 11.2896L1.49204 4.63721L2.82233 3.30692L10.1398 10.6244C10.3162 10.8009 10.4153 11.0401 10.4153 11.2896C10.4153 11.539 10.3162 11.7783 10.1398 11.9547L2.82233 19.2722L1.49204 17.9419L8.14441 11.2896Z"
              :fill="selectedGameMode === 'extended' ? 'white' : 'black'" />
          </svg>
        </div>
      </div>
      <div @click="isGameMaster && (selectedGameMode = 'creative')" :class="[
        'w-full rounded-lg flex flex-row items-stretch justify-between p-5 transition-all',
        selectedGameMode === 'creative'
          ? 'bg-black text-white border-2 border-black'
          : 'bg-neutral-200 text-black hover:bg-neutral-300',
        !isGameMaster && 'cursor-not-allowed opacity-50',
        isGameMaster && 'cursor-pointer'
      ]">
        <div class="flex flex-col gap-1 w-full">
          <p class="text-3xl font-semibold">Creative Mode</p>
          <p class="text-sm font-normal">Write ALL your own cards. Yes, even the black ones.</p>
        </div>
        <div class="flex justify-center items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="23" viewBox="0 0 12 23" fill="none">
            <path fill-rule="evenodd" clip-rule="evenodd"
              d="M8.14441 11.2896L1.49204 4.63721L2.82233 3.30692L10.1398 10.6244C10.3162 10.8009 10.4153 11.0401 10.4153 11.2896C10.4153 11.539 10.3162 11.7783 10.1398 11.9547L2.82233 19.2722L1.49204 17.9419L8.14441 11.2896Z"
              :fill="selectedGameMode === 'creative' ? 'white' : 'black'" />
          </svg>
        </div>
      </div>

      <!-- Collection Selection -->
       <div class="w-full flex flex-col gap-4">
         <div v-for="collection in collections" 
          :key="collection.id" 
          class="w-full flex flex-col gap-2 p-4 bg-neutral-200 rounded-lg hover:cursor-pointer hover:bg-neutral-300" 
          @click="() => { selectedCollectionId = collection.id }"
          :class="(collection.id === selectedCollectionId) ? 'border-4 border-blue-500' : ''">
            <p>{{ collection.name }}</p>
          </div>
       </div>
    </main>

    <!-- Footer -->
    <!-- Player List, Room Info -->
    <main
      class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] flex flex-col items-center justify-between min-h-lg w-full max-w-2xl px-8 pb-8 pt-4 gap-4">

      <div v-if="errorMessage" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {{ errorMessage }}
      </div>
      <!-- Player List -->
      <section class="flex flex-row w-full overflow-x-auto gap-4">
        <div v-for="player in players" :key="player.user_id"
          class="flex flex-col gap-2 items-center transition-all border-black text-black">
          <div class="size-12 rounded-full border-[3px] border-current bg-gray-500"></div>
          <p class="text-xs">{{ player.user_name }}</p>
        </div>
      </section>

      <!-- Start Game Button -->
      <section class="flex flew-row items-stretch w-full transition-all justify-between gap-4">
        <div class="flex flex-col gap-2 w-full">
          <div
            class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black">
            <div class="w-full flex flex-row items-center justify-between cursor-pointer hover:text-red-500">
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

  </main>
</template>
