<script setup lang="ts">
const props = defineProps({
    show: { type: Boolean, required: true },
    isGameMaster: { type: Boolean, required: true },
    roundStatus: { type: String, required: false, default: "" },
    savedCollectionId: { type: [String, null], required: false, default: null },
    mode: { type: String as () => "classic" | "creative" | null, required: false, default: null },
    leaveLoading: { type: Boolean, required: false, default: false },
    backToLobbyLoading: { type: Boolean, required: false, default: false },
    saveSetLoading: { type: Boolean, required: false, default: false },
});
const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'leave'): void;
    (e: 'back-to-lobby'): void;
    (e: 'save-set'): void;
}>();


function onBackdrop() { emit('close'); }
function onLeave() { emit('leave'); }
function onBackToLobby() { emit('back-to-lobby'); }
function onSaveSet() { emit('save-set'); }
</script>

<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-50 h-lvh flex items-center justify-center text-black bg-sky-300">
            <header ref="headerEl" class="fixed top-0 w-full flex items-center justify-start p-4 z-40">
                <div class="w-full flex flex-row gap-4 items-center">
                    <div class="cursor-pointer"
                        @click="onBackdrop">
                        <img src="~/assets/svg/blackback.svg" alt="Back" class="h-8 w-10" />
                    </div>
                </div>
            </header>
            <div class="p-5 max-w-md w-full h-full flex flex-col gap-4 items-center justify-center">
                <div class="text-4xl font-extrabold mb-8">Are you sure?</div>
                <Button variant="secondary" size="lg" block class="rounded-lg" :loading="leaveLoading" :disabled="leaveLoading"
                    @click="onLeave">
                    Leave Game
                    <template #loading>Leaving...</template>
                </Button>
                <Button v-if="isGameMaster" variant="primary" size="lg" block class="rounded-lg" :loading="backToLobbyLoading"
                    :disabled="backToLobbyLoading" @click="onBackToLobby">Back to
                    Lobby</Button>
                <Button
                    v-if="isGameMaster && roundStatus === 'round_end' && !savedCollectionId && props.mode === 'creative'"
                    variant="secondary" size="lg" block class="rounded-lg" :loading="saveSetLoading" :disabled="saveSetLoading"
                    @click="onSaveSet">Save
                    Set</Button>
            </div>
        </div>
    </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity .2s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>