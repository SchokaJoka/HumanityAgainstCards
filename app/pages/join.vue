<template>
  <main class="w-full flex items-center justify-center">
    <header class="fixed top-0 w-full flex items-center justify-start p-4 z-10">
      <div class="cursor-pointer" @click="navigateTo('/')">
        <svg xmlns="http://www.w3.org/2000/svg" width="38" height="33" viewBox="0 0 38 33" fill="none">
          <path
            d="M37 31.8505C32.596 26.4042 28.6852 23.314 25.2676 22.5797C21.85 21.8454 18.5962 21.7345 15.5062 22.2469V32L1 16.0852L15.5062 1.00003V10.2699C21.22 10.3155 26.0776 12.3922 30.079 16.5C34.0798 20.6078 36.3868 25.7247 37 31.8505Z"
            stroke="black" stroke-width="2" stroke-linejoin="round" />
        </svg>
      </div>
    </header>

    <main class="relative flex flex-col items-center justify-center min-h-svh w-full max-w-2xl p-8 gap-8">
      <div class="flex flex-col items-center justify-center h-svh w-full p-8 gap-8">
        <div class="size-32 rounded-full border-[3px] border-black flex items-center justify-center">
        </div>

        <!-- Guest Name Input -->
        <div class="flex flex-col gap-2 w-full">
          <div v-if="editingGuestName"
            class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black text-3xl font-normal">
            <div class="w-full flex flex-row items-center justify-between gap-1">
              <input v-model="guestNameEdit" type="text"
                class="w-full py-4 pl-4 bg-transparent outline-none border-0 focus:ring-0" @blur="saveGuestName"
                @keyup.enter="saveGuestName" ref="guestNameInput" />
              <div class="flex items-center px-5 h-full bg-neutral-200">
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
              class="w-full flex flex-row items-center justify-between gap-1 cursor-pointer hover:text-grey-500">
              <span v-if="user?.user_metadata?.full_name" class="py-4 pl-4 text-3xl font-normal">
                {{ user?.user_metadata?.full_name }}
              </span>
              <span v-else class="py-4 pl-4 text-3xl text-black/50 font-normal">
                {{ "Name" }}
              </span>
              <div class="flex items-center px-5 h-full bg-neutral-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="black">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        <!-- Login Action -->
        <div v-if="!user || !user.is_anomymous" class="w-full flex flex-row items-center justify-end gap-4">
          <p v-if="user" class="text-black text-md font-normal">or</p>
          <Button variant="secondary" size="md" @click="navigateTo('/login')">
            Login / Sign Up
          </Button>
        </div>

        <!-- Join Room by Code -->
        <div class="flex flex-col gap-2 w-full">
          <div
            class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black">
            <div class="w-full flex flex-row items-center justify-between cursor-pointer">
              <input v-model="roomCodeInput" placeholder="X4DD" type="text"
                class="w-full py-4 px-4 text-3xl font-normal" @keyup.enter="joinRoom" />
              <div @click="joinRoom" class="flex items-center px-8 h-full bg-neutral-200 h-full">
                <span class="text-black text-md font-normal">Join</span>
              </div>
            </div>
          </div>
          <div v-if="errorMessage" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"> {{
            errorMessage }} </div>
        </div>

      </div>
    </main>
  </main>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const roomCodeInput = ref<string>("");
const { getRoomIdByCode, getRoomMetadata } = useRoom();


// Start in editing mode if no user exists so they can enter a name
const editingGuestName = ref(!user.value);
const guestNameEdit = ref("");
const guestNameInput = ref<HTMLInputElement | null>(null);

const errorMessage = ref<string>("");

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
    errorMessage.value = "Name must be at least 3 characters.";
    return;
  }

  if (user.value) {
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: guestNameEdit.value,
      },
    });

    if (!error) {
      await supabase.auth.refreshSession();
    }
  } else {
    const { error } = await supabase.auth.signInAnonymously({
      options: {
        data: {
          full_name: guestNameEdit.value,
        },
      },
    });

    if (error) {
      errorMessage.value = "Failed to save guest name.";
    }
  }

  editingGuestName.value = false;
};


const joinRoom = async () => {
  if (user.value) {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    errorMessage.value = "";
    if (!roomCode) return;

    const roomId = await getRoomIdByCode(roomCode);
    if (!roomId) {
      errorMessage.value = "Room does not exist.";
      return;
    }
    /* if gameStarted = true for this room, user cant join room "game has already started*/
    const roomMeta = await getRoomMetadata(roomId);
    const roundStatus = roomMeta?.metadata?.round_status ?? null;
    if (roundStatus && roundStatus !== "lobby") {
      errorMessage.value = "Game has already started. You cannot join this room.";
      return;
    }

    await navigateTo(`/play/${roomCode}/lobby`);
  } else {
    errorMessage.value = "You must set a name before joining a room.";
  }
};
</script>
