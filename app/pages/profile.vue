<template>
  <main class="w-full flex items-center justify-center bg-[#FFB077]">
    <header ref="headerEl" class="fixed top-0 w-full flex flex-col items-start justify-start z-10 bg-[#FFB077]">
      <div class="flex flex-row items-center w-full gap-4 p-4">
        <div class="cursor-pointer" @click="navigateTo('/')">
          <img src="~/assets/svg/blackback.svg" alt="Back" class="h-8 w-10" />
        </div>
        <div class="w-full flex items-center justify-start">
          <h1 class="text-3xl font-semibold text-black">Profile</h1>
        </div>
      </div>
    </header>

    <main
      class="w-full flex flex-col items-center justify-between gap-4 max-w-3xl p-4 h-[100lvh] mt-[var(--profile-header-h)]">
      <template v-if="user && !user.is_anonymous">
        <div class="w-full flex flex-col items-center justify-center gap-4">
          <div
            class="p-2 relative size-52 rounded-full text-white flex items-center justify-center text-7xl font-bold mb-3">
            <button class="absolute bottom-0 right-0" @click="showAvatarOverlay = true">
              <div
                class="flex items-center justify-center rounded size-16 bg-black hover:scale-105 transition-transform">
                <img src="~/assets/svg/pencil-filled.svg" alt="Edit name" class="h-8 w-8" />
              </div>
            </button>
            <div v-if="!userProfile.avatar_url"
              class="flex items-center w-full h-full bg-black text-7xl justify-center border-[5px] border-black rounded-full">
              <span>
                {{ getInitials(user.user_metadata?.full_name) }}
              </span>
            </div>
            <div v-else class="flex items-center w-full h-full text-xl border-[5px] border-black rounded-full">
              <img :src="avatarSrc" alt="Avatar" class="w-full h-full object-cover rounded-full" />
            </div>
          </div>
          <p class="text-md text-black/80">
            {{ user.email }}
          </p>

          <div v-if="user" class="p-4 w-full">
            <label class="block text-2xl font-medium text-black mb-2">Username</label>
            <div v-if="editingGuestName"
              class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-white rounded border-[3px] border-black text-3xl font-normal">
              <div class="w-full flex flex-row items-center justify-between gap-1">
                <input v-model="guestNameEdit" type="text"
                  class="w-full py-4 pl-4 bg-transparent outline-none border-0 focus:ring-0" @blur="saveGuestName"
                  @keyup.enter="saveGuestName" ref="guestNameInput" />
                <div class="flex items-center h-full px-5 bg-black">
                  <img src="~/assets/svg/pencil-filled.svg" alt="Edit name" class="h-8 w-8" />
                </div>
              </div>
            </div>
            <div v-else
              class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-white rounded border-[3px] border-black text-3xl font-normal">
              <div class="w-full flex flex-row items-center justify-between gap-1 cursor-pointer"
                @click="startEditGuestName">
                <span class="w-full py-4 pl-4 truncate">
                  {{ user?.user_metadata?.full_name || "Guest" }}
                </span>
                <div class="flex items-center h-full px-5 bg-black">
                  <img src="~/assets/svg/pencil-filled.svg" alt="Edit name" class="h-8 w-8" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <p class="text-center text-lg">You must be logged in to edit your profile.</p>
        <div class="mt-4">
          <Button variant="secondary" size="md" @click="navigateTo('/login')">Login / Sign Up</Button>
        </div>
      </template>
    </main>

    <AvatarSelectionOverlay :show="showAvatarOverlay" :current-avatar="userProfile.avatar_url"
      :loading="avatarSaveLoading" @close="showAvatarOverlay = false" @save="handleAvatarSave" />

    <Transition name="fade-slide">
      <div v-if="errorMessage"
        class="fixed top-2 left-1/2 -translate-x-1/2 bg-white text-red-500 px-4 py-4 rounded-full border-[3px] border-black text-lg font-medium whitespace-nowrap z-50">
        {{ errorMessage }}
      </div>
    </Transition>

    <Transition name="fade-slide">
      <div v-if="successMessage"
        class="fixed top-2 left-1/2 -translate-x-1/2 bg-white text-green-500 px-4 py-4 rounded-full border-[3px] border-black text-lg font-medium whitespace-nowrap z-50">
        {{ successMessage }}
      </div>
    </Transition>
    <div class="fixed w-full bottom-[max(env(safe-area-inset-bottom),1.5rem)] flex flex-col items-center justify-center">
          <Button variant="secondary" size="md" @click="handleLogout">
            Logout
          </Button>
        </div>
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

const editingGuestName = ref(false);
const guestNameEdit = ref("");
const guestNameInput = ref<HTMLInputElement | null>(null);

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

const userProfile = ref({
  full_name: "",
  email: "",
  avatar_url: "",
});

const username = ref("");
const errorMessage = ref("");
const successMessage = ref("");
const loading = ref(false);
const showAvatarOverlay = ref(false);
const avatarSaveLoading = ref(false);

const { headerEl } = useHeaderHeight("--profile-header-h");

let messageClearTimer: ReturnType<typeof setTimeout> | null = null;
watch([errorMessage, successMessage], ([nextError, nextSuccess]) => {
  if (messageClearTimer) {
    clearTimeout(messageClearTimer);
    messageClearTimer = null;
  }
  if (nextError || nextSuccess) {
    messageClearTimer = setTimeout(() => {
      errorMessage.value = "";
      successMessage.value = "";
      messageClearTimer = null;
    }, 3000);
  }
});

const avatarSrc = computed(() => {
  const avatarValue = userProfile.value.avatar_url;
  if (!avatarValue) return "";

  const avatarNumber = Number(avatarValue);
  if (!Number.isFinite(avatarNumber) || avatarNumber < 1 || avatarNumber > avatarImages.length) {
    return "";
  }

  return avatarImages[avatarNumber - 1] || "";
});

const getInitials = (name: string | undefined) => {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase() || "?";
  }
  return name.substring(0, 2).toUpperCase();
};

async function updateProfile(username: string | null = null, avatarUrl: string | null = null): Promise<boolean> {
  errorMessage.value = "";
  successMessage.value = "";
  loading.value = true

  if (username) {
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: username,
      },
    });
    if (error) {
      errorMessage.value = error.message;
      loading.value = false;
      return false;
    } else {
      await supabase.auth.refreshSession();
      loading.value = false;
      successMessage.value = "Profile updated successfully!";
      return true;
    }
  } else if (avatarUrl) {
    const { error } = await supabase.auth.updateUser({
      data: {
        avatar_url: avatarUrl,
      },
    });
    if (error) {
      errorMessage.value = error.message;
      loading.value = false;
      return false;
    } else {
      await supabase.auth.refreshSession();
      loading.value = false;
      successMessage.value = "Profile updated successfully!";
      return true;
    }
  } else {
    errorMessage.value = "No changes to update";
    loading.value = false;
    return false;
  }
};

const handleAvatarSave = async (avatarId: string) => {
  avatarSaveLoading.value = true;

  const previousAvatar = userProfile.value.avatar_url;
  userProfile.value.avatar_url = avatarId;

  const success = await updateProfile(null, avatarId);
  if (!success) {
    userProfile.value.avatar_url = previousAvatar;
  } else {
    showAvatarOverlay.value = false;
  }

  avatarSaveLoading.value = false;
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

const handleLogout = async () => {
  await supabase.auth.signOut();
  navigateTo(`/`);
};

onMounted(async () => {
  if (user.value?.is_anonymous) {
    navigateTo(`/`);
  }

  userProfile.value = {
    full_name: user.value?.user_metadata?.full_name || "",
    email: user.value?.email || "",
    avatar_url: user.value?.user_metadata?.avatar_url || "",
  };

  if (!userProfile.value.avatar_url) {
    userProfile.value.avatar_url = "1";
    await updateProfile(null, userProfile.value.avatar_url);
  }
});
</script>

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

.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
}
</style>