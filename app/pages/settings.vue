<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100">
    <!-- Back button -->
    <div class="absolute top-4 left-4">
      <button @click="navigateTo(`/`)"
        class="px-4 py-2 text-gray-500 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2">
        ← Back to Lobby
      </button>
    </div>

    <h1 class="text-4xl font-bold mb-8">Profile</h1>

    <div class="bg-white p-8 rounded shadow-md w-96">
      <!-- Only show for authenticated (non-anonymous) users -->
      <template v-if="user && !user.is_anonymous">
        <!-- Avatar/Profile Picture Placeholder -->
        <div class="flex flex-col items-center mb-6">
          <div
            class="w-24 h-24 rounded-full bg-blue-500 text-white flex items-center justify-center text-4xl font-bold mb-3">
            {{ getInitials(user.user_metadata?.full_name) }}
          </div>
          <p class="text-sm text-gray-500">{{ user.email }}</p>
        </div>

        <!-- Edit Username -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Username
          </label>
          <input v-model="username" type="text" placeholder="Username" class="w-full px-4 py-2 border rounded"
            :disabled="loading" />
        </div>

        <!-- Save Changes Button -->
        <button @click="updateProfile"
          class="w-full my-2 px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          :disabled="loading || !username || username.length < 3">
          {{ loading ? "Saving..." : "Save Changes" }}
        </button>

        <!-- Logout Button -->
        <button @click="handleLogout" class="w-full my-2 px-6 py-3 bg-red-500 text-white rounded hover:bg-red-600">
          Logout
        </button>

        <!-- Messages -->
        <p v-if="errorMessage" class="text-red-500 mt-4 text-sm">
          {{ errorMessage }}
        </p>
        <p v-if="successMessage" class="text-green-500 mt-4 text-sm">
          {{ successMessage }}
        </p>
      </template>
    </div>
  </div>
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
      console.log("User is anonymous or not logged in, redirecting to lobby");
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
    // Refresh session to get updated data
    await supabase.auth.refreshSession();
    successMessage.value = "Profile updated successfully!";
  }

  loading.value = false;
};

const handleLogout = async () => {
  await supabase.auth.signOut();
  // navigateTo(`/`);
};
</script>
