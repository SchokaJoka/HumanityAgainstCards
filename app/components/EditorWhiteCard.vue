<script setup lang="ts">
import type { Tables } from "../../types/database.types";

type Card = Tables<"cards">;

const props = defineProps<{
    card: Card;
    editorId: string;
    canEdit: boolean;
}>();

const emit = defineEmits<{
    (e: 'update', text: string): void;
    (e: 'edit-start', editorId: string): void;
    (e: 'edit-end', editorId: string): void;
    (e: 'delete'): void;
}>();

const isEditing = ref(false);
const editingText = ref(props.card.text);
const editInput = ref<HTMLInputElement | null>(null);
const showDeleteConfirm = ref(false);

function startEdit() {
    if (!props.canEdit || isEditing.value) return;
    isEditing.value = true;
    emit('edit-start', props.editorId);
    editingText.value = props.card.text;
}

function handleAfterEnter(el: Element) {
    if (!isEditing.value) return;

    if (el instanceof HTMLInputElement) {
        el.focus();
        return;
    }

    editInput.value?.focus();
}

function save() {
    if (!isEditing.value) return;

    if (editingText.value.trim() === "") {
        alert("Card text cannot be empty.");
        editingText.value = props.card.text;
    } else {
        emit('update', editingText.value.trim());
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
</script>

<template>
    <div class="relative w-full flex flex-row items-center justify-between gap-4 bg-neutral-50 p-5 rounded-lg border-[3px] border-black">
        <transition name="edit-fade" mode="out-in" @after-enter="handleAfterEnter">
            <p v-if="!isEditing" class="w-full text-black text-xl font-semibold">{{ card.text }}</p>
            <input v-else ref="editInput" v-model="editingText" @keyup.enter="save()" @blur="save()" type="text"
            class="w-full text-black px-4 py-2 text-xl font-semibold bg-transparent border-none focus:ring-0" />
        </transition>
            <div class="flex flex-row gap-2 items-center">
                <div class="hover:cursor-pointer" :class="!canEdit && !isEditing ? 'opacity-40 pointer-events-none' : ''" @click="isEditing ? save() : startEdit()">
                    <svg v-if="isEditing" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                        fill="none">
                        <path d="M20 6L9 17L4 12" stroke="black" stroke-width="2.5" stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <g clip-path="url(#clip0_83_1922_white)">
                            <path d="M6 24H0V18M21 9L15 3L18 0L24 6M9 21L3 15L12 6L18 12" fill="black" />
                        </g>
                        <defs>
                            <clipPath id="clip0_83_1922_white">
                                <rect width="24" height="24" fill="white" />
                            </clipPath>
                        </defs>
                    </svg>
                </div>
                <div class="hover:cursor-pointer" @click="openDeleteConfirm()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                        d="M20.0001 6C20.255 6.00028 20.5001 6.09788 20.6855 6.27285C20.8708 6.44782 20.9823 6.68695 20.9973 6.94139C21.0122 7.19584 20.9294 7.44638 20.7658 7.64183C20.6023 7.83729 20.3702 7.9629 20.1171 7.993L20.0001 8H19.9191L19.0001 19C19.0002 19.7652 18.7078 20.5015 18.1828 21.0583C17.6579 21.615 16.94 21.9501 16.1761 21.995L16.0001 22H8.00011C6.40211 22 5.09611 20.751 5.00811 19.25L5.00311 19.083L4.08011 8H4.00011C3.74523 7.99972 3.50008 7.90212 3.31474 7.72715C3.12941 7.55218 3.01788 7.31305 3.00294 7.05861C2.988 6.80416 3.07079 6.55362 3.23438 6.35817C3.39797 6.16271 3.63002 6.0371 3.88311 6.007L4.00011 6H20.0001ZM10.0001 10C9.7349 10 9.48054 10.1054 9.29301 10.2929C9.10547 10.4804 9.00011 10.7348 9.00011 11V17C9.00011 17.2652 9.10547 17.5196 9.29301 17.7071C9.48054 17.8946 9.7349 18 10.0001 18C10.2653 18 10.5197 17.8946 10.7072 17.7071C10.8948 17.5196 11.0001 17.2652 11.0001 17V11C11.0001 10.7348 10.8948 10.4804 10.7072 10.2929C10.5197 10.1054 10.2653 10 10.0001 10ZM14.0001 10C13.7349 10 13.4805 10.1054 13.293 10.2929C13.1055 10.4804 13.0001 10.7348 13.0001 11V17C13.0001 17.2652 13.1055 17.5196 13.293 17.7071C13.4805 17.8946 13.7349 18 14.0001 18C14.2653 18 14.5197 17.8946 14.7072 17.7071C14.8948 17.5196 15.0001 17.2652 15.0001 17V11C15.0001 10.7348 14.8948 10.4804 14.7072 10.2929C14.5197 10.1054 14.2653 10 14.0001 10ZM14.0001 2C14.5305 2 15.0393 2.21071 15.4143 2.58579C15.7894 2.96086 16.0001 3.46957 16.0001 4C15.9998 4.25488 15.9022 4.50003 15.7273 4.68537C15.5523 4.8707 15.3132 4.98223 15.0587 4.99717C14.8043 5.01211 14.5537 4.92933 14.3583 4.76574C14.1628 4.60214 14.0372 4.3701 14.0071 4.117L14.0001 4H10.0001L9.99311 4.117C9.96301 4.3701 9.8374 4.60214 9.64195 4.76574C9.44649 4.92933 9.19595 5.01211 8.94151 4.99717C8.68707 4.98223 8.44793 4.8707 8.27296 4.68537C8.09799 4.50003 8.0004 4.25488 8.00011 4C7.99995 3.49542 8.19052 3.00943 8.53361 2.63945C8.8767 2.26947 9.34696 2.04284 9.85011 2.005L10.0001 2H14.0001Z"
                        fill="black" />
                    </svg>
                </div>
            </div>
        <transition name="delete-confirm-fade">
            <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 bg-black/40" @click="closeDeleteConfirm">
                <div class="absolute inset-0 flex items-center justify-center p-8">
                    <div class="bg-white text-black flex flex-col rounded-lg p-6 w-full max-w-xs" @click.stop>
                        <p class="font-semibold text-2xl">Do you want to delete this card?</p>
                        <div class="mt-16 flex flex-row justify-between w-full gap-8">
                            <Button size="md" variant="secondary" class="rounded" block @click="closeDeleteConfirm">No</Button>
                            <Button size="md" variant="primary" class="rounded" block @click="confirmDelete">Yes</Button>
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
