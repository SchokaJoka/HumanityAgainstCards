<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100">
    <h1 class="text-4xl font-bold mb-8">{{ mode === 'signup' ? 'Sign Up' : mode === 'anonymous' ? 'Guest Login' : 'Login' }}</h1>

    <div class="bg-white p-8 rounded shadow-md w-96">
      <!-- Email + Password fields for login/signup -->
      <template v-if="mode !== 'anonymous'">
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          class="w-full px-4 py-2 mb-4 border rounded"
          @keyup.enter="mode === 'signup' ? handleSignUp() : handleLogin()"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password (min 6 characters)"
          class="w-full px-4 py-2 mb-4 border rounded"
          @keyup.enter="mode === 'signup' ? handleSignUp() : handleLogin()"
        />
      </template>

      <!-- Username field for sign up and anonymous -->
      <template v-if="mode === 'signup' || mode === 'anonymous'">
        <input
          v-model="username"
          type="text"
          placeholder="Username (min 3 characters)"
          class="w-full px-4 py-2 mb-4 border rounded"
          @keyup.enter="mode === 'signup' ? handleSignUp() : handleAnonymousLogin()"
        />
      </template>

      <button
        @click="mode === 'signup' ? handleSignUp() : mode === 'anonymous' ? handleAnonymousLogin() : handleLogin()"
        class="w-full my-2 px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600"
        :disabled="loading"
      >
        {{ loading ? 'Please wait...' : (mode === 'signup' ? 'Sign Up' : mode === 'anonymous' ? 'Play as Guest' : 'Login') }}
      </button>

      <button
        @click="setMode(mode === 'login' ? 'signup' : 'login')"
        class="w-full my-2 px-6 py-3 text-blue-500 border border-blue-500 rounded hover:bg-blue-50"
        :disabled="loading"
      >
        {{ mode === 'signup' ? 'Already have an account? Login' : 'Need an account? Sign Up' }}
      </button>

      <button
        @click="setMode('anonymous')"
        class="w-full my-2 px-6 py-3 text-purple-500 border border-purple-500 rounded hover:bg-purple-50"
        :disabled="loading"
      >
        {{ mode === 'anonymous' ? 'Cancel Guest Login' : 'Continue as Guest' }}
      </button>

      <button
        @click="$router.push('/')"
        class="w-full my-2 px-6 py-3 text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
      >
        Back to Lobby
      </button>

      <p v-if="errorMessage" class="text-red-500 mt-4 text-sm">{{ errorMessage }}</p>
      <p v-if="successMessage" class="text-green-500 mt-4 text-sm">{{ successMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient();
const route = useRoute();
const email = ref('');
const password = ref('');
const username = ref('');
const mode = ref<'login' | 'signup' | 'anonymous'>('login');
const errorMessage = ref('');
const successMessage = ref('');
const loading = ref(false);

const getRedirectPath = () => {
  if(route.query.redirect === 'createGame') {
    return '/?action=createGame';
  } else if (route.query.redirect === 'joinGame' && route.query.roomCode) {
      return `/game/${route.query.roomCode}`;
  } else {
    return '/';
  }
}

const setMode = (newMode: 'login' | 'signup' | 'anonymous') => {
  mode.value = newMode;
  errorMessage.value = '';
  successMessage.value = '';
};

const handleLogin = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  if (!email.value || !password.value) {
    errorMessage.value = 'Please enter both email and password';
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
    console.error('Login error:', error);
  } else {
    successMessage.value = 'Login successful! Redirecting...';
    setTimeout(() => {
      navigateTo(getRedirectPath());
    }, 1000);
  }
};

const handleSignUp = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  // Validation
  if (!email.value || !password.value) {
    errorMessage.value = 'Please enter both email and password';
    return;
  }

  if (password.value.length < 6) {
    errorMessage.value = 'Password must be at least 6 characters';
    return;
  }

  if (!username.value || username.value.length < 3) {
    errorMessage.value = 'Username must be at least 3 characters';
    return;
  }

  loading.value = true;

  // Sign up with metadata that will be used by the trigger
  const { data, error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
    options: {
      data: {
        full_name: username.value,
      }
    }
  });

  loading.value = false;

  if (error) {
    errorMessage.value = error.message;
    console.error('Sign up error:', error);
  } else {
    // Check if email confirmation is required
    if (data.user && !data.session) {
      successMessage.value = 'Sign up successful! Please check your email to confirm your account.';
    } else {
      setTimeout(() => {
        navigateTo(getRedirectPath());
      });
    }
  }
};

const handleAnonymousLogin = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  if (!username.value || username.value.length < 3) {
    errorMessage.value = 'Username must be at least 3 characters';
    return;
  }

  loading.value = true;

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: {
        full_name: username.value,
      },
    },
  });

  loading.value = false;

  if (error) {
    errorMessage.value = error.message;
    console.error('Anonymous login error:', error);
  } else {
    successMessage.value = 'Logged in as guest! Redirecting...';
    setTimeout(() => {
      navigateTo(getRedirectPath());
    }, 1000);
  }
};
</script>