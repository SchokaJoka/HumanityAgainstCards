<template>
  <main class="w-full flex items-center justify-center bg-black text-white">
    <header ref="headerEl" class="fixed top-0 w-full flex items-center justify-start p-4 z-40">
      <div class="cursor-pointer" @click="handleMenuToggle">
        <svg xmlns="http://www.w3.org/2000/svg" width="29" height="24" viewBox="0 0 29 24"
          class="stroke-white stroke-[4]">
          <line y1="2" x2="29" y2="2" />
          <line y1="12" x2="29" y2="12" />
          <line y1="22" x2="29" y2="22" />
        </svg>
      </div>
    </header>

    <!-- Menu overlay -->
    <div class="fixed inset-0 z-40" :class="isMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'">
      <div class="absolute inset-0 bg-black/40 transition-opacity duration-300"
        :class="isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" @click="closeMenu" />

      <aside
        class="absolute left-0 top-0 h-dvh w-64 flex flex-col bg-[#FFB077] text-black shadow-lg transition-transform duration-300 ease-out"
        :class="isMenuOpen ? 'translate-x-0' : '-translate-x-full'">
        <div class="flex items-center justify-between p-4">
          <div class="h-[24px] w-full flex flex-row justify-end items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
              class="stroke-black stroke-[4] cursor-pointer" @click="handleMenuToggle">
              <line x1="3" y1="3" x2="21" y2="21" />
              <line x1="21" y1="3" x2="3" y2="21" />
            </svg>
          </div>
        </div>

        <nav class="flex flex-col gap-2 h-full justify-between">
          <div class="flex flex-col gap-2">
            <button v-if="!user || user.is_anonymous"
              class="text-left px-4 py-2 hover:bg-black/20 text-3xl font-semibold transition-all"
              @click="handleAuthAction">
              Log in
            </button>
            <button v-if="user && !user.is_anonymous"
              class="text-left px-4 py-2 hover:bg-black/20 text-3xl font-semibold transition-all" @click="goToProfile">
              Profile
            </button>
            <button v-if="user && !user.is_anonymous"
              class="text-left px-4 py-2 hover:bg-black/20 text-3xl font-semibold transition-all"
              @click="navigateTo('/sets')">
              Sets
            </button>
            <button v-if="user && !user.is_anonymous"
              class="text-left px-4 py-2 hover:bg-black/20 text-3xl font-semibold transition-all"
              @click="handleAuthAction">
              Logout
            </button>
          </div>
          <div v-if="user" class="p-4 w-full">
            <div v-if="editingGuestName"
              class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-white rounded-lg border-[3px] border-black text-lg font-normal">
              <div class="w-full flex flex-row items-center justify-between gap-1">
                <input v-model="guestNameEdit" type="text"
                  class="w-full py-4 pl-4 bg-transparent outline-none border-0 focus:ring-0" @blur="saveGuestName"
                  @keyup.enter="saveGuestName" ref="guestNameInput" />
                <div class="flex items-center h-full px-4 bg-black">
                  <img src="~/assets/svg/pencil-filled.svg" alt="Edit name" class="h-10 w-10" />
                </div>
              </div>
            </div>
            <div v-else
              class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-white rounded-lg border-[3px] border-black text-lg font-normal">
              <div class="w-full flex flex-row items-center justify-between gap-1 cursor-pointer"
                @click="startEditGuestName">
                <span class="w-full py-4 pl-4 truncate">
                  {{ user?.user_metadata?.full_name || "Guest" }}
                </span>
                <div class="flex items-center h-full px-4 bg-black">
                  <img src="~/assets/svg/pencil-filled.svg" alt="Edit name" class="h-10 w-10" />
                </div>
              </div>
            </div>
          </div>
        </nav>
      </aside>
    </div>

    <!-- Main Content -->
    <section class="relative flex flex-col items-center justify-start h-full w-full max-w-2xl gap-16">
      <!-- Welcome -->
      <div class="flex flex-col w-full gap-8 py-4 justify-between h-lvh px-16">
        <div></div>
        <div class="w-full flex flex-col gap-8">
          <h1 class="h-fit text-5xl font-extrabold mb-4">
            <span class="block">Humanity</span>
            <span class="block">Against</span>
            <span class="block text-[#FFB077]">
              {{ user?.user_metadata?.full_name || "Cards" }}
            </span>
          </h1>
          <Button @click="createGame()" variant="primary" size="lg" block class="">Create Game</Button>
          <Button @click="joinGame()" variant="primary" size="lg" block class="">Join Game</Button>
        </div>
        <div class="w-full flex justify-center transition-opacity duration-300"
          :class="showScrollIndicator ? 'opacity-100' : 'opacity-0 pointer-events-none'">
          <img src="~/assets/svg/weui_arrow-outlined.svg" class="h-8 w-8 animate-bounce" />
        </div>
      </div>

      <div class="flex flex-col gap-1 pt-8 justify-between h-lvh">
        <div></div>
        <!-- How To Play -->
        <p class="w-full h-fit text-lg font-semibold px-16">
          <span class="text-4xl font-extrabold block mb-4">How to Play</span>
          Each player starts with 10 white cards.<br><br>
          Every round a Czar is chosen and they draw a random black card. <br><br>
          Every player has to submit the amount of white cards needed to answer the black card.<br><br>
          The Czar picks their favorite white card. Winner receives 1 point!
        </p>
        <!-- Credits -->
        <div class="w-full flex flex-col gap-2 px-4 pb-2 pt-4 text-xs items-start bg-white text-black rounded-t-xl">
          <p>
            Made with ❤️ by Eve Steiger - Karim Pathan - Joel Kammermann
          </p>
          <p>
            Developed as a semester project for the Studio UX & Web 2 module
          </p>
          <p>
            We would like to thank our lecturers for their guidance throughout the development process.
          </p>
          <div class="w-full flex flex-row justify-between items-center">
            <div class="w-24 h-10 flex items-center justify-start">
              <img class="max-w-full max-h-full object-contain rounded-full" src="~/assets/img/di-logo.jpg" alt="Digital Ideation logo" />
            </div>
            <div class="w-32 h-10 flex items-center justify-end">
              <img class="max-w-full max-h-full object-contain" src="~/assets/img/hslu-logo-black.png" alt="HSLU logo" />
            </div>
          </div>
        </div>
      </div>
      <p v-if="lobbyError" class="text-red-500 mt-4 text-sm">{{ lobbyError }}</p>
    </section>

  </main>
</template>

<script setup>

const lobbyError = ref("");
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const route = useRoute();

const isJoiningGame = ref(false);
const isMenuOpen = ref(false);
const showScrollIndicator = ref(true);

const { headerEl } = useHeaderHeight("--home-header-h");

const handleWindowScroll = () => {
  showScrollIndicator.value = window.scrollY < 10;
};

// Guest name editing
const editingGuestName = ref(false);
const guestNameEdit = ref("");
const guestNameInput = ref(null);

onMounted(async () => {
  if (route.query.action === "createGame") {
    await createGame();
  }

  handleWindowScroll();
  window.addEventListener("scroll", handleWindowScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleWindowScroll);
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
  navigateTo(`/profile`);
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