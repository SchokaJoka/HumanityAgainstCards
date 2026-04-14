<template>
  <main class="w-full flex items-center justify-center">
    <header class="fixed top-0 w-full flex items-center justify-start p-4 z-10">
      <div class="cursor-pointer" @click="navigateTo('/')">
        <img src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
      </div>
    </header>

    <main class="relative flex flex-col items-center justify-center min-h-svh w-full max-w-2xl p-8 gap-8">
      <div class="flex flex-col items-center justify-center h-svh w-full p-8 gap-8">
        <div
          class="size-32 rounded-full border-[3px] border-black flex items-center justify-center overflow-hidden bg-white">
          <img v-if="avatarSrc" :src="avatarSrc" alt="Avatar" class="w-full h-full object-cover" />
          <span v-else class="text-4xl font-bold">{{ getInitials(user?.user_metadata?.full_name) }}</span>
        </div>
        <Button v-if="user" variant="secondary" size="md" @click="showAvatarOverlay = true">Edit avatar</Button>

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
        <div v-if="!user || !user.is_anonymous" class="w-full flex flex-row items-center justify-end gap-4">
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
              <div @click="joinRoom" class="flex items-center px-8 bg-neutral-200 h-full">
                <span class="text-black text-md font-normal">Join</span>
              </div>
            </div>
          </div>
          <div v-if="errorMessage" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"> {{
            errorMessage }} </div>
        </div>

      </div>
    </main>

    <AvatarSelectionOverlay :show="showAvatarOverlay" :current-avatar="currentAvatar" :loading="avatarSaveLoading"
      @close="showAvatarOverlay = false" @save="handleAvatarSave" />
  </main>
</template>

<script setup lang="ts">
import avatar1 from "~/assets/img/avatar/avatar-1.png";
import avatar2 from "~/assets/img/avatar/avatar-2.png";
import avatar3 from "~/assets/img/avatar/avatar-3.png";
import avatar4 from "~/assets/img/avatar/avatar-4.png";
import avatar5 from "~/assets/img/avatar/avatar-5.png";
import avatar6 from "~/assets/img/avatar/avatar-6.png";
import avatar7 from "~/assets/img/avatar/avatar-7.png";
import avatar8 from "~/assets/img/avatar/avatar-8.png";
import avatar9 from "~/assets/img/avatar/avatar-9.png";
import avatar10 from "~/assets/img/avatar/avatar-10.png";

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const roomCodeInput = ref<string>("");
const { getRoomIdByCode, getRoomMetadata } = useRoom();


// Start in editing mode if no user exists so they can enter a name
const editingGuestName = ref(!user.value);
const guestNameEdit = ref("");
const guestNameInput = ref<HTMLInputElement | null>(null);
const showAvatarOverlay = ref(false);
const avatarSaveLoading = ref(false);
const assigningDefaultAvatar = ref(false);

const avatarImages = [
  avatar1,
  avatar2,
  avatar3,
  avatar4,
  avatar5,
  avatar6,
  avatar7,
  avatar8,
  avatar9,
  avatar10,
];

const currentAvatar = computed(() => {
  return String(user.value?.user_metadata?.avatar_url || "");
});

const avatarSrc = computed(() => {
  const avatarValue = currentAvatar.value;
  if (!avatarValue) return "";

  const avatarNumber = Number(avatarValue);
  if (!Number.isFinite(avatarNumber) || avatarNumber < 1 || avatarNumber > avatarImages.length) {
    return "";
  }

  return avatarImages[avatarNumber - 1] || "";
});

const errorMessage = ref<string>("");

const getInitials = (name: string | undefined) => {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase() || "?";
  }
  return name.substring(0, 2).toUpperCase();
};

const updateAvatar = async (avatarId: string): Promise<boolean> => {
  const { error } = await supabase.auth.updateUser({
    data: {
      avatar_url: avatarId,
    },
  });

  if (error) {
    errorMessage.value = error.message;
    return false;
  }

  await supabase.auth.refreshSession();
  return true;
};

const handleAvatarSave = async (avatarId: string) => {
  avatarSaveLoading.value = true;
  const success = await updateAvatar(avatarId);
  if (success) {
    showAvatarOverlay.value = false;
  }
  avatarSaveLoading.value = false;
};

watch(
  user,
  async (newUser) => {
    if (!newUser?.is_anonymous) return;
    if (newUser.user_metadata?.avatar_url) return;
    if (assigningDefaultAvatar.value) return;

    assigningDefaultAvatar.value = true;
    await updateAvatar("1");
    assigningDefaultAvatar.value = false;
  },
  { immediate: true },
);

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
    const roomMetadata = roomMeta?.metadata as { round_status?: string } | null | undefined;
    const roundStatus = roomMetadata?.round_status ?? null;
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
