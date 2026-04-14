<script setup lang="ts">
const props = defineProps<{
    submission: any;
    collectionCards: any[];
    isSelected?: boolean;
}>();

const emit = defineEmits<{
    (e: "select", submission: any): void;
}>();

const cardTextById = computed(() => {
    const map = new Map<string, string>();
    for (const c of props.collectionCards || []) map.set(c.id, c.text);
    return map;
});

const submittedCards = computed(() => props.submission?.metadata?.submitted_cards ?? []);
const getCardText = (id: string) => cardTextById.value.get(id) ?? "Unknown card";
</script>

<template>
    <div class="submitted-card-container w-full max-w-md">
        <button type="button" class="submitted-stack w-full text-left" @click="emit('select', submission)">
            <div v-for="(cardId, index) in submittedCards" :key="`${submission.user_id}-${cardId}-${index}`"
                class="bg-white p-4 pr-8 shadow-xl h-full w-full relative rounded-t-xl border-black border-x-2 border-t-2"
                :class="[
                    index === submittedCards.length - 1 ? 'rounded-b-xl border-b-2' : '',
                    index === 0 ? 'pb-8' : '-mt-6 pb-16'
                ]">
                <span class="submitted-card-text font-bold text-black">
                    {{ getCardText(cardId) }}
                </span>
                <div
                    class="absolute top-2 right-2 size-8 p-[0.1rem] flex items-center justify-center bg-white rounded-full text-xs font-bold">
                    <div class="bg-black size-full rounded-full flex items-center justify-center text-white font-bold">
                        {{ index + 1 }}
                    </div>
                </div>
            </div>
        </button>
    </div>
</template>

<style scoped>
.submitted-stack {
    break-inside: avoid;
    margin-bottom: 1rem;
}

.submitted-card-text {
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: pre-wrap;
}
</style>