<script setup lang="ts">
import type { Tables } from "../../types/database.types";

type Card = Tables<"cards">;

const props = defineProps<{
    card: Card;
    editorId: string;
    canEdit: boolean;
    autoEdit?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update', data: { text: string; number_of_gaps: number }): void;
    (e: 'edit-start', editorId: string): void;
    (e: 'edit-end', editorId: string): void;
    (e: 'delete'): void;
}>();

const isEditing = ref(false);
const currentBlackCardText = ref<any[]>([]);
const GAP_TOKEN: string = "[[W1tnYXBdXQ==]]";
const MAX_GAPS = 3;
const showDeleteConfirm = ref(false);
const editTextareas = ref<HTMLTextAreaElement[]>([]);

const gapCount = computed(() => currentBlackCardText.value.filter((part: any) => part.isGap).length);
const canInsertGap = computed(() => gapCount.value < MAX_GAPS);

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

watch(
    () => props.autoEdit,
    (val) => {
        if (val) nextTick(startEdit);
    },
    { immediate: true }
);

function startEdit() {
    if (!props.canEdit || isEditing.value) return;
    isEditing.value = true;
    emit('edit-start', props.editorId);
    currentBlackCardText.value = getTextParts(props.card.text || "");
    resizeAllTextareas();
}

function insertGap() {
    if (!canInsertGap.value) return;
    currentBlackCardText.value.push({ text: "", isGap: true, gapIndex: gapCount.value });
}

function insertText() {
    currentBlackCardText.value.push({ text: "", isGap: false });
    resizeAllTextareas();
}

function deleteLast() {
    currentBlackCardText.value.pop();
}

function save() {
    if (!isEditing.value) return;

    if (currentBlackCardText.value.every((part: any) => part.text.trim() === "")) {
        alert("Card text cannot be empty.");
        return;
    } else {
        const newText = currentBlackCardText.value.map((part: any) => part.isGap ? GAP_TOKEN : part.text.trim()).filter(text => text).join(" ");
        const numberOfGaps = currentBlackCardText.value.filter((part: any) => part.isGap).length;
        emit('update', { text: newText, number_of_gaps: numberOfGaps });
    }
    isEditing.value = false;
    emit('edit-end', props.editorId);
}

function openDeleteConfirm() {
    showDeleteConfirm.value = true;
}

function closeDeleteConfirm() {
    showDeleteConfirm.value = false;
}

function confirmDelete() {
    showDeleteConfirm.value = false;
    emit('delete');
}

function autoResizeTextarea(textarea: HTMLTextAreaElement | null) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
}

function resizeAllTextareas() {
    nextTick(() => {
        editTextareas.value.forEach(autoResizeTextarea);
    });
}

function handleTextareaInput(event: Event) {
    autoResizeTextarea(event.target as HTMLTextAreaElement | null);
}
</script>

<template>
    <div
        class="relative w-full flex flex-row items-center justify-between gap-4 bg-black p-5 rounded-lg border-[3px] border-white transition-all">
        <transition name="edit-fade" mode="out-in" @after-enter="resizeAllTextareas">
            <div v-if="!isEditing"
                class="flex-1 min-w-0 max-h-28 overflow-y-auto pr-2 flex flex-row flex-wrap items-center gap-2 text-white text-xl font-semibold">
                <template v-for="(part, index) in getTextParts(card.text || '')" :key="index">
                    <div v-if="part.isGap"
                        class="inline-flex items-center justify-center px-4 py-1 rounded-md bg-white text-black text-sm font-semibold tracking-wider">
                        ___
                    </div>
                    <span v-else class="min-w-0 break-words whitespace-pre-wrap">{{ part.text }}</span>
                </template>
            </div>
            <div v-else class="flex-1 min-w-0 flex flex-col gap-2">
                <div class="w-full pr-2 flex flex-col gap-2">
                    <div v-for="part, index in currentBlackCardText" :key="index" class="w-full flex flex-row gap-4">
                        <div v-if="part.isGap"
                            class="inline-flex items-center justify-center px-4 py-1 border-2 border-white rounded-md bg-white/10 text-white text-sm font-semibold tracking-wide">
                            GAP
                        </div>
                        <textarea v-else ref="editTextareas" v-model="part.text" rows="2" @input="handleTextareaInput"
                            @keydown.enter.prevent
                            class="flex-1 min-w-0 bg-white text-black px-2 py-1 rounded resize-none break-words whitespace-pre-wrap overflow-hidden"></textarea>
                    </div>
                </div>
                <div class="w-full flex flex-row gap-2">
                    <Button v-if="!currentBlackCardText[currentBlackCardText.length - 1]?.isGap && canInsertGap"
                        @click="insertGap()" variant="primary" size="sm" block class="">Insert Gap</Button>
                    <Button v-if="currentBlackCardText[currentBlackCardText.length - 1]?.isGap" @click="insertText()"
                        variant="primary" size="sm" block class="">Insert Text</Button>
                    <Button v-if="currentBlackCardText.length > 1" @click="deleteLast()" variant="primary" size="sm"
                        block class="">Delete</Button>
                </div>
            </div>
        </transition>
        <div class="flex flex-row gap-2 items-center">
            <div class="hover:cursor-pointer" :class="!canEdit && !isEditing ? 'opacity-40 pointer-events-none' : ''"
                @click="isEditing ? save() : startEdit()">
                <svg v-if="isEditing" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                    fill="none">
                    <path d="M20 6L9 17L4 12" stroke="white" stroke-width="2.5" stroke-linecap="round"
                        stroke-linejoin="round" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <g clip-path="url(#clip0_83_1922_black)">
                        <path d="M6 24H0V18M21 9L15 3L18 0L24 6M9 21L3 15L12 6L18 12" fill="white" />
                    </g>
                    <defs>
                        <clipPath id="clip0_83_1922_black">
                            <rect width="24" height="24" fill="black" />
                        </clipPath>
                    </defs>
                </svg>
            </div>
            <div class="hover:cursor-pointer" @click="openDeleteConfirm()">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M20.0001 6C20.255 6.00028 20.5001 6.09788 20.6855 6.27285C20.8708 6.44782 20.9823 6.68695 20.9973 6.94139C21.0122 7.19584 20.9294 7.44638 20.7658 7.64183C20.6023 7.83729 20.3702 7.9629 20.1171 7.993L20.0001 8H19.9191L19.0001 19C19.0002 19.7652 18.7078 20.5015 18.1828 21.0583C17.6579 21.615 16.94 21.9501 16.1761 21.995L16.0001 22H8.00011C6.40211 22 5.09611 20.751 5.00811 19.25L5.00311 19.083L4.08011 8H4.00011C3.74523 7.99972 3.50008 7.90212 3.31474 7.72715C3.12941 7.55218 3.01788 7.31305 3.00294 7.05861C2.988 6.80416 3.07079 6.55362 3.23438 6.35817C3.39797 6.16271 3.63002 6.0371 3.88311 6.007L4.00011 6H20.0001ZM10.0001 10C9.7349 10 9.48054 10.1054 9.29301 10.2929C9.10547 10.4804 9.00011 10.7348 9.00011 11V17C9.00011 17.2652 9.10547 17.5196 9.29301 17.7071C9.48054 17.8946 9.7349 18 10.0001 18C10.2653 18 10.5197 17.8946 10.7072 17.7071C10.8948 17.5196 11.0001 17.2652 11.0001 17V11C11.0001 10.7348 10.8948 10.4804 10.7072 10.2929C10.5197 10.1054 10.2653 10 10.0001 10ZM14.0001 10C13.7349 10 13.4805 10.1054 13.293 10.2929C13.1055 10.4804 13.0001 10.7348 13.0001 11V17C13.0001 17.2652 13.1055 17.5196 13.293 17.7071C13.4805 17.8946 13.7349 18 14.0001 18C14.2653 18 14.5197 17.8946 14.7072 17.7071C14.8948 17.5196 15.0001 17.2652 15.0001 17V11C15.0001 10.7348 14.8948 10.4804 14.7072 10.2929C14.5197 10.1054 14.2653 10 14.0001 10ZM14.0001 2C14.5305 2 15.0393 2.21071 15.4143 2.58579C15.7894 2.96086 16.0001 3.46957 16.0001 4C15.9998 4.25488 15.9022 4.50003 15.7273 4.68537C15.5523 4.8707 15.3132 4.98223 15.0587 4.99717C14.8043 5.01211 14.5537 4.92933 14.3583 4.76574C14.1628 4.60214 14.0372 4.3701 14.0071 4.117L14.0001 4H10.0001L9.99311 4.117C9.96301 4.3701 9.8374 4.60214 9.64195 4.76574C9.44649 4.92933 9.19595 5.01211 8.94151 4.99717C8.68707 4.98223 8.44793 4.8707 8.27296 4.68537C8.09799 4.50003 8.0004 4.25488 8.00011 4C7.99995 3.49542 8.19052 3.00943 8.53361 2.63945C8.8767 2.26947 9.34696 2.04284 9.85011 2.005L10.0001 2H14.0001Z"
                        fill="white" />
                </svg>
            </div>
        </div>
        <transition name="delete-confirm-fade">
            <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 bg-black/40" @click="closeDeleteConfirm">
                <div class="absolute inset-0 flex items-center justify-center p-8">
                    <div class="bg-white text-black flex flex-col rounded-lg p-6 w-full max-w-xs" @click.stop>
                        <p class="font-semibold text-2xl">Do you want to delete this card?</p>
                        <div class="mt-16 flex flex-row justify-between w-full gap-8">
                            <Button size="md" variant="secondary" class="rounded" block
                                @click="closeDeleteConfirm">No</Button>
                            <Button size="md" variant="primary" class="rounded" block
                                @click="confirmDelete">Yes</Button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
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

.delete-confirm-fade-enter-active,
.delete-confirm-fade-leave-active {
    transition: opacity 160ms ease;
}

.delete-confirm-fade-enter-from,
.delete-confirm-fade-leave-to {
    opacity: 0;
}
</style>
