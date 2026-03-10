<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100">
    <div class="absolute top-4 right-4">
      <button
        @click="handleAuthAction"
        class="px-4 py-2 text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
      >
        {{ user ? "Logout" : "Login" }}
      </button>
    </div>
    <h1 class="text-4xl font-bold mb-2">Cards Against Humanity</h1>
    <p class="text-gray-500 mb-8">
      <span v-if="user">Playing as: <span class="font-semibold text-gray-700">{{ user.user_metadata.full_name }}</span></span>
      <span v-else>Playing as: Guest</span>
    </p>

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

      <p v-if="lobbyError" class="text-red-500 mt-4 text-sm">{{ lobbyError }}</p>
    </div>
  </div>
</template>

<script setup>
const roomCodeInput = ref("");
const lobbyError = ref("");
const supabase = useSupabaseClient();
const user = useSupabaseUser();

console.log("User, ", user.value);

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

  const { data: currentAuthData } = await supabase.auth.getUser();
  let currentUser = currentAuthData.user;

  if (!currentUser) {
    const { data: anonymousAuthData, error: anonymousAuthError } =
      await supabase.auth.signInAnonymously();

    if (anonymousAuthError) {
      lobbyError.value =
        "Could not create guest session. Please refresh and try again.";
      console.error("Anonymous auth failed:", anonymousAuthError);
      return;
    }

    currentUser = anonymousAuthData.user;
  }

  if (!currentUser?.id) {
    lobbyError.value =
      "No player identity available. Please refresh and try again.";
    return;
  }

  const newRoomCode = generateRoomCode();

  const { data: createdRoom, error: roomInsertError } = await supabase
    .from("rooms")
    .insert({
      code: newRoomCode,
      owner: currentUser.id,
      metadata: {},
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

  await navigateToRoom(roomCode);
};

const handleAuthAction = async () => {
  if (user.value) {
    // User is logged in, so log them out
    await supabase.auth.signOut();
  } else {
    // User is not logged in, redirect to login page
    await navigateTo("/login");
  }
};
</script>


