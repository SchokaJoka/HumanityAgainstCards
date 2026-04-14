<template>
  <main class="w-full flex items-center justify-center">
    <header ref="headerEl" class="fixed top-0 w-full flex flex-col items-start justify-start z-10 bg-black">
      <div class="flex flex-row items-center w-full gap-4 p-4">
        <div class="cursor-pointer" @click="goBack">
          <img src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
        </div>
      </div>
      <div class="w-full flex flex-row justify-center z-10">
        <div class="w-full flex flex-row z-10 max-w-3xl ">
          <button class="w-full px-3 py-4 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
            :class="activeTab === 'login'
              ? 'text-black bg-[#FFB077]'
              : 'text-white bg-[#D77560] hover:bg-neutral-250'" @click="switchTab('login')">
            Login
          </button>
          <button class="w-full px-3 py-4 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
            :class="activeTab === 'signup'
              ? 'text-black bg-[#FFB077]'
              : 'text-white bg-[#D77560] hover:bg-neutral-250'" @click="switchTab('signup')">
            Sign Up
          </button>
        </div>
      </div>
    </header>

    <main
      class="relative flex flex-col items-center justify-start w-full h-fit max-w-3xl bg-[#FFB077] mt-[var(--auth-header-h)]">
      <div class="flex flex-col h-full w-full">
        <div class="h-fit flex flex-col p-12 min-h-screen">
          <Transition name="tab-fade" mode="out-in">
            <div :key="activeTab">
              <!-- LOGIN TAB -->
              <div v-if="activeTab === 'login'" class="flex flex-col gap-6">
                <h2 class="text-2xl font-semibold">Login to Your Account</h2>
                <input v-model="email" type="email" placeholder="Email"
                  class="text-2xl font-light bg-white w-full px-4 py-2 border-2 border-black rounded"
                  @keyup.enter="handleLogin()" />
                <input v-model="password" type="password" placeholder="Password"
                  class="text-2xl font-light bg-white w-full px-4 py-2 border-2 border-black rounded"
                  @keyup.enter="handleLogin()" />

                <div class="w-full flex items-center justify-center mb-8">
                  <Button variant="secondary" size="md" @click="handleLogin()" :disabled="loading" :loading="loading"
                    class="">
                    Login
                  </Button>

                </div>

                <h3 class="text-2xl font-semibold">Continue as guest</h3>
                <input v-model="guestUsername" type="text" placeholder="Username"
                  class="text-2xl font-light bg-white w-full px-4 py-2 border-2 border-black rounded"
                  @keyup.enter="handleAnonymousLogin()" />

                <div class="w-full flex items-center justify-center">
                  <Button variant="secondary" size="md" @click="handleAnonymousLogin()" :disabled="loading"
                    :loading="loading">
                    Play as Guest
                  </Button>
                </div>

                <p v-if="errorMessage" class="w-full px-4 py-2 border-[3px] rounded bg-red-100 text-red-700">
                  {{ errorMessage }}
                </p>
                <p v-if="successMessage" class="w-full px-4 py-2 border-[3px] rounded bg-green-100 text-green-700">
                  {{ successMessage }}
                </p>
              </div>

              <!-- SIGN UP TAB -->
              <div v-else-if="activeTab === 'signup'" class="flex flex-col gap-6">
                <h2 class="text-2xl font-semibold">Create Your Account</h2>
                <input v-model="signupEmail" type="email" placeholder="Email"
                  class="text-2xl font-light bg-white w-full px-4 py-2 border-2 border-black rounded"
                  @keyup.enter="handleSignUp()" />
                <input v-model="signupPassword" type="password" placeholder="Password (min 6 characters)"
                  class="text-2xl font-light bg-white w-full px-4 py-2 border-2 border-black rounded"
                  @keyup.enter="handleSignUp()" />
                <input v-model="signupUsername" type="text" placeholder="Username (min 3 characters)"
                  class="text-2xl font-light bg-white w-full px-4 py-2 border-2 border-black rounded"
                  @keyup.enter="handleSignUp()" />

                <div class="w-full flex items-center justify-center mb-8">
                  <Button variant="secondary" size="md" @click="handleSignUp()" :disabled="loading" :loading="loading"
                    class="">
                    Sign Up
                  </Button>
                </div>

                <p v-if="errorMessage" class="w-full px-4 py-2 border-[3px] rounded bg-red-100 text-red-700">
                  {{ errorMessage }}
                </p>
                <p v-if="successMessage" class="w-full px-4 py-2 border-[3px] rounded bg-green-100 text-green-700">
                  {{ successMessage }}
                </p>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </main>
  </main>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient();
const route = useRoute();
const user = useSupabaseUser();
const { headerEl, updateHeaderHeight } = useHeaderHeight("--auth-header-h");

// Login form
const email = ref("");
const password = ref("");
const guestUsername = ref("");

// Sign up form
const signupEmail = ref("");
const signupPassword = ref("");
const signupUsername = ref("");

const activeTab = ref<"login" | "signup">("login");
const errorMessage = ref("");
const successMessage = ref("");
const loading = ref(false);

const goBack = async () => {
  if (import.meta.client && window.history.length > 1) {
    window.history.back();
    return;
  }

  await navigateTo("/");
};

const getRedirectPath = () => {
  if (route.query.redirect === "createGame") {
    return "/?action=createGame";
  } else if (route.query.redirect === "joinGame" && route.query.roomCode) {
    return `/play/${route.query.roomCode}/lobby`;
  } else {
    return "/";
  }
};

const switchTab = (tab: 'login' | 'signup') => {
  activeTab.value = tab;
  errorMessage.value = "";
  successMessage.value = "";
};

const handleLogin = async () => {
  errorMessage.value = "";
  successMessage.value = "";

  if (!email.value || !password.value) {
    errorMessage.value = "Please enter both email and password";
    return;
  }

  loading.value = true;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });

  loading.value = false;

  if (error) {
    errorMessage.value = error.message;
    console.error("Login error:", error);
  } else {
    successMessage.value = "Login successful! Redirecting...";
    setTimeout(() => {
      navigateTo(getRedirectPath());
    }, 1000);
  }
};

const handleSignUp = async () => {
  errorMessage.value = "";
  successMessage.value = "";

  // Validation
  if (!signupEmail.value || !signupPassword.value || !signupUsername.value) {
    errorMessage.value = "Please enter email password and username";
    return;
  }

  if (signupPassword.value.length < 6) {
    errorMessage.value = "Password must be at least 6 characters";
    return;
  }

  if (!signupUsername.value || signupUsername.value.length < 3) {
    errorMessage.value = "Username must be at least 3 characters";
    return;
  }

  loading.value = true;

  // If user is already anonymous, convert them to permanent user
  if (user.value && user.value.is_anonymous) {
    const { error: updateError } = await supabase.auth.updateUser({
      email: signupEmail.value,
      password: signupPassword.value,
      data: {
        full_name: signupUsername.value,
      },
    });

    loading.value = false;

    if (updateError) {
      errorMessage.value = updateError.message;
      console.error("Convert anonymous user error:", updateError);
    } else {
      await supabase.auth.refreshSession();

      successMessage.value = "Account created successfully! Redirecting...";
      setTimeout(() => {
        navigateTo(getRedirectPath());
      }, 1000);
    }
    return;
  }

  // For new users, who are not already anonymously registered
  const { data, error } = await supabase.auth.signUp({
    email: signupEmail.value,
    password: signupPassword.value,
    options: {
      data: {
        full_name: signupUsername.value,
      },
    },
  });

  loading.value = false;

  if (error) {
    errorMessage.value = error.message;
    console.error("Sign up error:", error);
  } else {
    // Check if email confirmation is required
    if (data.user && !data.session) {
      successMessage.value =
        "Sign up successful! Please check your email to confirm your account.";
    } else {
      setTimeout(() => {
        navigateTo(getRedirectPath());
      }, 1000);
    }
  }
};

const handleAnonymousLogin = async () => {
  errorMessage.value = "";
  successMessage.value = "";

  if (user.value && user.value.is_anonymous) {
    if (guestUsername.value && guestUsername.value.length >= 3) {
      loading.value = true;

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: guestUsername.value,
        },
      });

      loading.value = false;

      if (updateError) {
        errorMessage.value =
          "failed to update username: " + updateError.message;
        console.error("Username update error:", updateError);
        return;
      }

      await supabase.auth.refreshSession();

      successMessage.value = "Username updated! Redirecting...";
      setTimeout(() => {
        navigateTo(getRedirectPath());
      }, 1000);
    } else if (!guestUsername.value || guestUsername.value.length < 3) {
      errorMessage.value = "Username must be at least 3 characters";
      return;
    } else {
      navigateTo(getRedirectPath());
    }
    return;
  }

  if (!guestUsername.value || guestUsername.value.length < 3) {
    errorMessage.value = "Username must be at least 3 characters";
    return;
  }

  loading.value = true;

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: {
        full_name: guestUsername.value,
      },
    },
  });

  loading.value = false;

  if (error) {
    errorMessage.value = error.message;
    console.error("Anonymous login error:", error);
  } else {
    successMessage.value = "Logged in as guest! Redirecting...";
    setTimeout(() => {
      navigateTo(getRedirectPath());
    }, 1000);
  }
};

onMounted(() => {
  if (user.value?.is_anonymous && user.value?.user_metadata?.full_name) {
    guestUsername.value = user.value.user_metadata.full_name;
    signupUsername.value = user.value.user_metadata.full_name;
  }
});
</script>

<style scoped>
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.tab-fade-enter-from {
  opacity: 0;
}

.tab-fade-leave-to {
  opacity: 0;
}
</style>