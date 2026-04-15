<script setup lang="ts">

const emit = defineEmits<{
    (e: 'submit', data: { text: string; number_of_gaps: number }): void;
}>();

const currentBlackCardText = ref<any[]>([{ text: "", isGap: false }]);
const GAP_TOKEN: string = "[[W1tnYXBdXQ==]]";
const MAX_GAPS = 3;

const getTextParts = (text: string): any[] => {
    if (!text.includes(GAP_TOKEN)) {
        return [{ text, isGap: false }];
    }

    const textParts = text.split(GAP_TOKEN);
    const parts: any[] = [];
    let gapIndex = 0;

    textParts.forEach((part: string, index: number) => {
        if (part) {
            parts.push({ text: part, isGap: false });
        }

        if (index < textParts.length - 1) {
            parts.push({ text: "", isGap: true, gapIndex });
            gapIndex += 1;
        }
    });

    return parts;
};

function insertGap() {
    if (number_of_gaps.value >= MAX_GAPS) return;
    currentBlackCardText.value.push({ text: "", isGap: true, gapIndex: number_of_gaps.value });
}

function insertText() {
    currentBlackCardText.value.push({ text: "", isGap: false });
}

function deleteLast() {
    currentBlackCardText.value.pop();
}

const number_of_gaps = computed(() => currentBlackCardText.value.filter((part: any) => part.isGap).length);

function submitBlackCard() {
    const text = currentBlackCardText.value
        .map((part: any) => (part.isGap ? GAP_TOKEN : (part.text ?? "")))
        .join("");

    console.log("submitBlackCard:", { text: text, number_of_gaps: number_of_gaps.value });

    emit('submit', {
        text,
        number_of_gaps: number_of_gaps.value,
    });
}

watch(currentBlackCardText, () => {
    console.log("Current Black Card Text:", currentBlackCardText.value);
}, { deep: true });
</script>

<template>
    <div
        class="relative w-full h-full flex flex-col items-center justify-between gap-4 bg-black p-5 rounded-lg border-[3px] border-white transition-all">
        <div class="w-full flex flex-col gap-2 h-full overflow-y-auto">
            <div v-for="part, index in currentBlackCardText" :key="index" class="w-full flex flex-row gap-4">
                <div v-if="part.isGap"
                    class="bg-white px-3 py-1 rounded text-center font-bold text-black border-[3px] border-white">
                    ___
                </div>
                <input v-else v-model="part.text"
                    class="w-full h-fit bg-neutral-600 border-[3px] border-white text-white text-lg px-2 py-1 outline-none rounded break-words whitespace-pre-wrap resize-y leading-snug"></input>
            </div>
        </div>
        <div class="w-full flex flex-row gap-2">
            <Button v-if="!currentBlackCardText[currentBlackCardText.length - 1]?.isGap && number_of_gaps < MAX_GAPS" @click="insertGap()"
                variant="primary" size="sm" block class="">Insert Gap</Button>
            <Button v-if="currentBlackCardText[currentBlackCardText.length - 1]?.isGap" @click="insertText()"
                variant="primary" size="sm" block class="">Insert Text</Button>
            <Button v-if="currentBlackCardText.length" @click="deleteLast()" variant="primary" size="sm" block
                class="">Delete Last</Button>
            <Button v-if="currentBlackCardText.length > 1" @click="submitBlackCard()" variant="primary" size="sm" block
                class="">Submit</Button>
        </div>

    </div>
</template>

<style scoped>
.edit-fade-enter-active,
.edit-fade-leave-active {
    transition: all 180ms ease;
}

.edit-fade-enter-from,
.edit-fade-leave-to {
    /* opacity: 0; */
    transform: scale(0.99);
}
</style>
