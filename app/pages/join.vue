<template>
  <header class="fixed top-0 w-full flex items-center justify-start p-4 bg-white z-10">
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
      <div v-if="user" class="flex flex-col gap-2 w-full">
        <div v-if="editingGuestName"
          class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black text-3xl font-normal">
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
            <span class="py-4 pl-4 text-3xl font-normal">
              {{ user?.user_metadata?.full_name || "Guest" }}
            </span>
            <div class="flex items-center px-5 h-full bg-neutral-200 h-full">
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
        <p class="text-black text-md font-normal">or</p>
        <button class="px-6 py-4 bg-neutral-200 text-white rounded-xl hover:bg-neutral-300 transition">
          <span class="text-black text-md font-normal">Login / Sign Up</span>
        </button>
      </div>

      <!-- Guest Name Input -->
      <div v-if="user" class="flex flex-col gap-2 w-full">
        <div
          class="flex flex-row gap-2 items-stretch h-fit overflow-clip bg-neutral-50 rounded-lg border-[3px] border-black">
          <div class="w-full flex flex-row items-center justify-between cursor-pointer hover:text-blue-500">
            <input v-model="roomCodeInput" placeholder="X4DD" type="text" class="w-full py-4 px-4 text-3xl font-normal">
            </input>
            <div class="flex items-center px-8 h-full bg-neutral-200 h-full">
              <span class="text-black text-md font-normal">Join</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
const user = useSupabaseUser();
const roomCodeInput = ref<string>("");

const editingGuestName = ref(false);
const guestNameEdit = ref("");
const guestNameInput = ref(null);

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
</script>
