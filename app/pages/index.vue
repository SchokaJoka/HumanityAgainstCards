<template>
  <div
    class="flex flex-col items-center justify-center min-h-screen bg-gray-100"
  >
    <div class="absolute top-4 right-4 flex items-center space-x-4">
      <!-- Guest: Editable name -->
      <template v-if="user?.is_anonymous">
        <div class="px-4 py-2 text-gray-500 rounded flex items-center gap-2">
          <template v-if="editingGuestName">
            <input
              v-model="guestNameEdit"
              type="text"
              class="font-bold border-b-2 border-blue-500 bg-transparent outline-none"
              @blur="saveGuestName"
              @keyup.enter="saveGuestName"
              ref="guestNameInput"
            />
          </template>
          <template v-else>
            <span
              @click="startEditGuestName"
              class="font-bold cursor-pointer hover:text-blue-500"
              title="Click to edit name"
            >
              {{ user?.user_metadata?.full_name || "Guest" }}

              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </span>
          </template>
          <span>(Guest)</span>
        </div>
        <button
          @click="handleAuthAction"
          class="px-4 py-2 text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
        >
          Login
        </button>
      </template>

      <!-- Authenticated: Avatar icon -->
      <template v-else-if="user && !user.is_anonymous">
        <button
          @click="goToProfile"
          class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold hover:bg-blue-600 transition"
          :title="`${user?.user_metadata?.full_name || 'Profile'}`"
        >
          {{ getInitials(user?.user_metadata?.full_name) }}
        </button>
      </template>

      <!-- Not logged in -->
      <template v-else>
        <button
          @click="handleAuthAction"
          class="px-4 py-2 text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
        >
          Login
        </button>
      </template>
    </div>

    <h1 class="text-4xl font-bold mb-2">Cards Against Humanity</h1>

    <!-- Rest of your code stays the same -->
    <div class="bg-white p-8 rounded shadow-md w-96">
      <h2 class="text-xl font-semibold mb-4">Start new Game</h2>
      <button
        @click="createGame"
        class="w-full my-2 px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Create Room
      </button>

      <hr class="my-6" />

      <h2 class="text-xl font-semibold mb-4">Join Game</h2>
      <input
        v-model="roomCodeInput"
        type="text"
        placeholder="Enter Room Code (e.g. A7X9)"
        class="w-full px-4 py-2 mb-4 border rounded"
        @keyup.enter="joinGame"
      />
      <button
        @click="joinGame"
        :disabled="!roomCodeInput"
        class="w-full my-2 px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Join Room
      </button>

      <p v-if="lobbyError" class="text-red-500 mt-4 text-sm">
        {{ lobbyError }}
      </p>
    </div>
  </div>
</template>

<script setup>
const roomCodeInput = ref("");
const lobbyError = ref("");
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const route = useRoute();

// Guest name editing
const editingGuestName = ref(false);
const guestNameEdit = ref("");
const guestNameInput = ref(null);

onMounted(async () => {
  console.log("User, ", user.value);

  if (route.query.action === "createGame") {
    await createGame();
  }
});

const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const goToProfile = () => {
  navigateTo(`/${user.value.id}`);
};

const startEditGuestName = () => {
  guestNameEdit.value = user.value?.user_metadata?.full_name || "";
  editingGuestName.value = true;
  nextTick(() => {
    guestNameInput.value?.focus();
  });
};

const saveGuestName = async () => {
  if (!guestNameEdit.value || guestNameEdit.value.length < 3) {
    editingGuestName.value = false;
    return;
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: guestNameEdit.value,
    },
  });

  if (!error) {
    await supabase.auth.refreshSession();
  }

  editingGuestName.value = false;
};

// Nuxt's built-in navigation helper
const navigateToRoom = async (roomCode) => {
  await navigateTo(`/game/${roomCode}`);
};

// Generates a random 4-character string for easy sharing
const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
};

const createGame = async () => {
  console.log("Creating a new game room...");
  lobbyError.value = "";

  if (!user.value) {
    await navigateTo("/login?redirect=createGame");
    return;
  }

  const newRoomCode = generateRoomCode();

  const { data: createdRoom, error: roomInsertError } = await supabase
    .from("rooms")
    .insert({
      code: newRoomCode,
      owner: user.value.id || user.value.sub,
      metadata: { round_status: "lobby"},
    })
    .select()
    .single();

  if (roomInsertError) {
    lobbyError.value = "Could not create room in database. Please try again.";
    console.error("Room insert failed:", roomInsertError);
    return;
  }

  console.log("Created room:", createdRoom);

  // Navigate the host to the new room
  await navigateToRoom(createdRoom.code);
};

const joinGame = async () => {
  lobbyError.value = "";

  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) return;

  if (!user.value) {
    await navigateTo("/login?redirect=joinGame&roomCode=" + roomCode);
    return;
  }

  await navigateToRoom(roomCode);
};

const handleAuthAction = async () => {
  // User is not logged in, redirect to login page
  await navigateTo("/login");
};
</script>
