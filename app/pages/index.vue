<template>
  <header class="fixed top-0 w-full flex items-center justify-start p-4 bg-white z-40">
    <div class="cursor-pointer" @click="handleMenuToggle">
      <svg xmlns="http://www.w3.org/2000/svg" width="29" height="24" viewBox="0 0 29 24"
        class="stroke-black stroke-[4]">
        <line y1="2" x2="29" y2="2" />
        <line y1="12" x2="29" y2="12" />
        <line y1="22" x2="29" y2="22" />
      </svg>
    </div>
  </header>

  <!-- Menu overlay -->
  <div class="fixed inset-0 z-20" :class="isMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'">
    <div class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" @click="closeMenu" />

    <aside
      class="absolute left-0 top-0 h-svh w-64 flex flex-col bg-white shadow-lg transition-transform duration-300 ease-out"
      :class="isMenuOpen ? 'translate-x-0' : '-translate-x-full'">
      <div class="flex items-center justify-between p-4">
        <!-- <div class="cursor-pointer" @click="closeMenu">
          <svg xmlns="http://www.w3.org/2000/svg" width="29" height="24" viewBox="0 0 29 24"
            class="stroke-black stroke-[4]">
            <line y1="2" x2="29" y2="2" />
            <line y1="12" x2="29" y2="12" />
            <line y1="22" x2="29" y2="22" />
          </svg>
        </div> -->
        <div class="h-[24px]"></div>
      </div>

      <nav class="flex flex-col gap-2 h-full justify-between">
        <div class="flex flex-col gap-2">
          <button v-if="!user || user.is_anonymous" class="text-left px-4 py-2 hover:bg-gray-100 text-2xl font-normal"
            @click="handleAuthAction">
            Log in
          </button>
          <button v-if="user && !user.is_anonymous" class="text-left px-4 py-2 hover:bg-gray-100 text-2xl font-normal"
            @click="goToProfile">
            Profile
          </button>
          <button class="text-left px-4 py-2 hover:bg-gray-100 text-2xl font-normal" @click="closeMenu">
            Sets
          </button>
          <button v-if="user && !user.is_anonymous" class="text-left px-4 py-2 hover:bg-gray-100 text-2xl font-normal"
            @click="handleAuthAction">
            Logout
          </button>
        </div>
        <div v-if="user" class="flex flex-col gap-2 p-4">
          <div v-if="editingGuestName"
            class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black text-lg font-normal">
            <div class="w-full flex flex-row items-center justify-between gap-1">
              <input v-model="guestNameEdit" type="text"
                class="w-full py-4 pl-4 bg-transparent outline-none border-0 focus:ring-0" @blur="saveGuestName"
                @keyup.enter="saveGuestName" ref="guestNameInput" />
              <div class="flex items-center px-4 h-full bg-neutral-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="black">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </div>
          </div>
          <div v-else
            class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black">
            <button @click="startEditGuestName"
              class="w-full flex flex-row items-center justify-between gap-1 cursor-pointer hover:text-blue-500">
              <span class="py-4 pl-4 text-lg font-normal">
                {{ user?.user_metadata?.full_name || "Guest" }}
              </span>
              <div class="flex items-center px-4 h-full bg-neutral-400 h-full">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="black">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </button>
            <!-- <span>(Guest)</span> -->
          </div>
        </div>
      </nav>
    </aside>
  </div>

  <main class="relative flex flex-col items-center justify-center min-h-svh w-full max-w-2xl p-8 gap-8">
    <div class="flex flex-col items-center justify-center h-svh w-full p-8 gap-8">
      <h1 class="w-full h-fit text-black text-5xl font-normal">
        Der Kampf gegen das Bünzlitum
      </h1>
      <Button @click="createGame()" variant="primary" size="lg" block class="rounded-xl">Create Game</Button>
      <Button @click="joinGame()" variant="primary" size="lg" block class="rounded-xl">Join Game</Button>
    </div>

    <!-- How To Play -->
    <div class="flex flex-col gap-1">
      <h1 class="w-full h-fit text-black text-4xl font-normal">How to Play</h1>
      <ul class="w-full h-fit text-black text-xl font-normal px-4 list-disc list-outside pl-6">
        <li>Each player starts with a hand of 10 white cards.</li>
        <li>A black card is chosen at random and displayed to all players.</li>
        <li>
          The black card will present a number i.e. 2 Each player must play this
          number of white cards.
        </li>
        <li>
          The first player starts as the Card Czar. Their role is to select
          their favourite white card as the winner. The winning player receives
          1 point!
        </li>
      </ul>
    </div>

    <p v-if="lobbyError" class="text-red-500 mt-4 text-sm">{{ lobbyError }}</p>
  </main>
</template>

<script setup>
const lobbyError = ref("");
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const route = useRoute();

const isJoiningGame = ref(false);
const isMenuOpen = ref(false);

// Guest name editing
const editingGuestName = ref(false);
const guestNameEdit = ref("");
const guestNameInput = ref(null);

onMounted(async () => {
  if (route.query.action === "createGame") {
    await createGame();
  }

  console.log("Current user:", user.value);
});

const openMenu = () => {
  isMenuOpen.value = true;
};

const closeMenu = () => {
  isMenuOpen.value = false;
};

const handleMenuToggle = () => {
  isMenuOpen.value = !isMenuOpen.value;
};

const goToProfile = () => {
  navigateTo(`/settings`);
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
  await navigateTo(`/play/${roomCode}/lobby`);
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
      metadata: {
        round_status: "lobby"
      },
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

  await navigateTo("/join");
};

const handleAuthAction = async () => {
  if (user.value && !user.value.is_anonymous) {
    // User is logged in, so log them out
    await supabase.auth.signOut();
    reloadNuxtApp();
  } else {
    // User is not logged in, redirect to login page
    await navigateTo("/login");
  }
};
</script>
