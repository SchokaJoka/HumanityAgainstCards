<script setup lang="ts">
const props = defineProps({
    show: { type: Boolean, required: true },
    isGameMaster: { type: Boolean, required: true },
    roundStatus: { type: String, required: false, default: "" },
    savedCollectionId: { type: [String, null], required: false, default: null },
    mode: { type: String as () => "classic" | "creative" | null, required: false, default: null },
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
        <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center text-black bg-white">
            <div class="p-5 max-w-md w-full h-full flex flex-col gap-4 items-center justify-center">
                <div class="text-lg font-semibold">Are you sure?</div>
                <p class="text-sm">Leaving will remove you from the game.</p>
                <Button variant="danger" size="lg" block @click="onLeave">Leave Game</Button>
                <Button v-if="isGameMaster" variant="primary" size="lg" block @click="onBackToLobby">Back to
                    Lobby</Button>
                <Button v-if="isGameMaster && roundStatus === 'round_end' && !savedCollectionId && props.mode === 'creative'"
                    variant="tertiary" size="lg" block @click="onSaveSet">Save Set</Button>
                <Button variant="ghost" size="lg" block @click="onBackdrop">Cancel</Button>
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