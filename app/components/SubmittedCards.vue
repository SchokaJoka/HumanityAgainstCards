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
const isSingle = computed(() => submittedCards.value.length === 1);
const getCardText = (id: string) => cardTextById.value.get(id) ?? "Unknown card";
</script>

<template>
    <div class="w-full" :class="isSingle ? 'flex justify-start' : ''">
        <div class="break-inside-avoid mb-4 text-left"
            :class="isSingle ? 'w-full' : 'w-full'">
            <div v-for="(cardId, index) in submittedCards" :key="`${submission.user_id}-${cardId}-${index}`"
                class="bg-white p-4 pr-8 w-full max-h-64 h-auto overflow-y-auto relative rounded-t-xl border-black border-x-2 border-t-2"
                :class="[
                    index === submittedCards.length - 1 ? 'rounded-b-xl border-b-2' : '',
                    isSingle ? '' : index === 0 ? 'pb-8' : '-mt-6 pb-16 min-h-56'
                ]">
                <span class="font-bold text-black [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap">
                    {{ getCardText(cardId) }}
                </span>
                <div
                    class="absolute top-2 right-2 size-8 p-[0.1rem] flex items-center justify-center bg-white rounded-full text-xs font-bold">
                    <div class="bg-black size-full rounded-full flex items-center justify-center text-white font-bold">
                        {{ (index as number) + 1 }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

