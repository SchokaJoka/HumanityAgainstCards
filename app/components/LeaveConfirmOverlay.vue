<script setup lang="ts">
const props = defineProps({
    show: { type: Boolean, required: true },
    isGameMaster: { type: Boolean, required: true },
    roundStatus: { type: String, required: false, default: "" },
    savedCollectionId: { type: [String, null], required: false, default: null },
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
        <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-white rounded-lg p-5 max-w-md w-full mx-4">
                <div class="text-lg font-semibold mb-2">Are you sure?</div>
                <p class="text-sm mb-4">Leaving will remove you from the game.</p>
                <div class="flex flex-wrap gap-2">
                    <button @click="onLeave" class="px-4 py-2 rounded bg-red-600 text-white">Leave Game</button>
                    <button v-if="isGameMaster" @click="onBackToLobby"
                        class="px-4 py-2 rounded bg-blue-600 text-white">Back to Lobby</button>
                    <button v-if="isGameMaster && roundStatus === 'round_end' && !savedCollectionId" @click="onSaveSet"
                        class="px-4 py-2 rounded bg-amber-500 text-black">Save Set</button>
                    <button @click="onBackdrop" class="px-4 py-2 rounded border">Cancel</button>
                </div>
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