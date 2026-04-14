<script setup lang="ts">
import avatar1 from "~/assets/img/avatar/avatar-1.png";
import avatar2 from "~/assets/img/avatar/avatar-2.png";
import avatar3 from "~/assets/img/avatar/avatar-3.png";
import avatar4 from "~/assets/img/avatar/avatar-4.png";
import avatar5 from "~/assets/img/avatar/avatar-5.png";
import avatar6 from "~/assets/img/avatar/avatar-6.png";
import avatar7 from "~/assets/img/avatar/avatar-7.png";
import avatar8 from "~/assets/img/avatar/avatar-8.png";
import avatar9 from "~/assets/img/avatar/avatar-9.png";
import avatar10 from "~/assets/img/avatar/avatar-10.png";

const props = withDefaults(defineProps<{
    show: boolean;
    currentAvatar?: string;
    loading?: boolean;
}>(), {
    currentAvatar: "",
    loading: false,
});

const emit = defineEmits<{
    (event: "close"): void;
    (event: "save", avatarId: string): void;
}>();

const avatars = [
    { id: "1", src: avatar1 },
    { id: "2", src: avatar2 },
    { id: "3", src: avatar3 },
    { id: "4", src: avatar4 },
    { id: "5", src: avatar5 },
    { id: "6", src: avatar6 },
    { id: "7", src: avatar7 },
    { id: "8", src: avatar8 },
    { id: "9", src: avatar9 },
    { id: "10", src: avatar10 },
];

const selectedAvatar = ref("1");

watch(
    () => [props.show, props.currentAvatar],
    () => {
        if (!props.show) return;
        selectedAvatar.value = props.currentAvatar || "1";
    },
    { immediate: true },
);

const handleSave = () => {
    emit("save", selectedAvatar.value);
};
</script>

<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-50 bg-black/80 p-4 sm:p-6 flex items-center justify-center"
            @click.self="emit('close')">
            <div
                class="max-w-2xl overflow-hidden rounded-lg border-[3px] border-black shadow-2xl flex flex-col gap-4 p-4 items-center bg-white">
                <h2 class="text-2xl align-center font-semibold text-black">Choose your avatar</h2>

                <div class="w-full flex flex-col gap-6 items-center overflow-auto">
                    <div class="items-center justify-center grid grid-cols-3 gap-4 p-2">
                        <button v-for="avatar in avatars" :key="avatar.id" type="button"
                            class="rounded-full transition-all size-20"
                            :class="selectedAvatar === avatar.id ? 'scale-[1.02]' : ''"
                            @click="selectedAvatar = avatar.id">
                            <img :src="avatar.src" :alt="`Avatar ${avatar.id}`"
                                class="w-full aspect-square object-cover rounded" />
                            <img v-if="selectedAvatar === avatar.id" src="~/assets/svg/selected.svg" alt="Selected"
                                class="absolute right-0 bottom-0 h-6 w-6 drop-shadow-sm" />
                        </button>
                    </div>
                </div>
                <Button variant="secondary" size="md" :loading="loading" :disabled="loading" @click="handleSave">
                    Done
                </Button>
            </div>
        </div>
    </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
