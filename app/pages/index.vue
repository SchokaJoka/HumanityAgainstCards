<template>
  <div class="lobby-container">
    <div>
      <h1>Cards Against Humanity</h1>
      <!-- show name if user is logged in otherwise show you're playing as a guest -->
      <p v-if="user.value">
        Playing as:
        {{ user.value.user_metadata.full_name }}
      </p>
      <p v-else>Playing as: Guest</p>
    </div>

    <!-- login button redirecting to login page, change name to Logout if already loggedged in -->
    <button @click="handleAuthAction">
      {{ user ? "Logout" : "Login" }}
    </button>

    <div class="create-section mx-1 my-1">
      <h3>Start a New Game</h3>
      <button @click="createGame">Create Room</button>
    </div>

    <hr />

    <div class="join-section">
      <h3>Join Existing Game</h3>
      <input
        v-model="roomCodeInput"
        type="text"
        placeholder="Enter Room Code (e.g. A7X9)"
        @keyup.enter="joinGame"
      />
      <button @click="joinGame" :disabled="!roomCodeInput">Join Room</button>
    </div>

    <p v-if="lobbyError" class="error-text">
      {{ lobbyError }}
    </p>
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

<style scoped>
/* Add some quick styling to separate the sections */
.lobby-container {
  max-width: 400px;
  margin: 0 auto;
  text-align: center;
}
.create-section,
.join-section {
  margin: 2rem 0;
}
input {
  padding: 0.5rem;
  margin-right: 0.5rem;
}
button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}
.error-text {
  color: #dc2626;
  margin-top: 1rem;
}
</style>
