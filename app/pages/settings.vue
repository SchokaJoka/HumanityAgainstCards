<template>
  <main class="w-full flex items-center justify-center">
    <header ref="headerEl" class="fixed top-0 w-full flex flex-col items-start justify-start z-10 bg-black">
      <div class="flex flex-row items-center w-full gap-4 p-4">
        <div class="cursor-pointer" @click="navigateTo('/')">
          <img src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
        </div>
        <h1 class="text-2xl font-semibold text-white">Profile</h1>
      </div>
    </header>

    <main
      class="relative flex flex-col items-center justify-start w-full h-fit max-w-3xl bg-[#FFB077] mt-[var(--auth-header-h)]">
      <div class="flex flex-col h-full w-full">
        <div class="h-fit flex flex-col p-12 min-h-screen">
          <div class="max-w-md w-full mx-auto">
            <div class="bg-white p-8 rounded shadow-md">
              <template v-if="user && !user.is_anonymous">
                <div class="flex flex-col items-center mb-6">
                  <div
                    class="w-24 h-24 rounded-full bg-white text-black border-2 border-black flex items-center justify-center text-4xl font-bold mb-3">
                    {{ getInitials(user.user_metadata?.full_name) }} </div>
                  <p class="text-sm text-gray-500">{{ user.email }}</p>
                </div>

                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-2">Username</label>
                  <input v-model="username" type="text" placeholder="Username"
                    class="text-2xl font-light bg-white w-full px-4 py-2 border-2 border-black rounded"
                    :disabled="loading" />
                </div>

                <div class="w-full flex flex-col gap-3">
                  <Button variant="secondary" size="md" @click="updateProfile"
                    :disabled="loading || !username || username.length < 3">
                    {{ loading ? "Saving..." : "Save Changes" }}
                  </Button>

                  <Button variant="danger" size="md" @click="handleLogout">
                    Logout
                  </Button>
                </div>

                <p v-if="errorMessage" class="text-red-500 mt-4 text-sm">
                  {{ errorMessage }}
                </p>
                <p v-if="successMessage" class="text-green-500 mt-4 text-sm">
                  {{ successMessage }}
                </p>
              </template>

              <template v-else>
                <p class="text-center text-lg">You must be logged in to edit your profile.</p>
                <div class="mt-4">
                  <Button variant="secondary" size="md" @click="navigateTo('/login')">Login / Sign Up</Button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </main>
  </main>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient();
const user = useSupabaseUser();

const username = ref("");
const errorMessage = ref("");
const successMessage = ref("");
const loading = ref(false);

// update username with supabase user 
watch(
  user,
  (newUser) => {
    if (newUser && !newUser.is_anonymous) {
      username.value = newUser.user_metadata?.full_name || "";
    } else if (newUser?.is_anonymous || !newUser) {
      navigateTo(`/`);
    }
  },
  { immediate: true },
);

const getInitials = (name: string | undefined) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const updateProfile = async () => {
  errorMessage.value = "";
  successMessage.value = "";

  if (!username.value || username.value.length < 3) {
    errorMessage.value = "Username must be at least 3 characters";
    return;
  }

  loading.value = true;

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: username.value,
    },
  });

  if (error) {
    errorMessage.value = error.message;
    console.error("Profile update error:", error);
  } else {
    await supabase.auth.refreshSession();
    successMessage.value = "Profile updated successfully!";
  }

  loading.value = false;
};

const handleLogout = async () => {
  await supabase.auth.signOut();
  navigateTo(`/`);
};
</script>

<style scoped>
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
}
</style>