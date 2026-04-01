<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        mode: "classic" | "extended" | "creative";
        title: string;
        description: string;
        selectedMode: "classic" | "extended" | "creative";
        canSelect: boolean;
        collections: Array<{ id: string; name: string }>;
        selectedCollectionId: string | null;
        showArrowIcon?: boolean;
    }>(),
    {
        showArrowIcon: true,
    },
);

const emit = defineEmits<{
    select: [mode: "classic" | "extended" | "creative"];
    selectCollection: [collectionId: string];
}>();

const isSelected = computed(() => props.selectedMode === props.mode);
const showCollections = computed(
    () => props.canSelect && isSelected.value && props.mode !== "creative",
);

function handleSelect() {
    if (!props.canSelect) return;
    emit("select", props.mode);
}

function handleCollectionSelect(collectionId: string) {
    if (!showCollections.value) return;
    emit("selectCollection", collectionId);
}
</script>

<template>
    <div class="w-full rounded-lg flex flex-col justify-between p-5 transition-all" :class="[
        isSelected
            ? 'bg-black text-white'
            : 'bg-neutral-200 text-black hover:bg-neutral-300',
        !canSelect && 'cursor-not-allowed opacity-50',
        canSelect && 'cursor-pointer',
    ]" @click="handleSelect">
        <div class="flex flex-row justify-between w-full">
            <div class="flex flex-col gap-1 w-full">
                <p class="text-3xl font-semibold">{{ title }}</p>
                <p class="text-sm font-normal">{{ description }}</p>
            </div>
            <div v-if="showArrowIcon" class="flex justify-center items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="23" viewBox="0 0 12 23" fill="none"
                    class="arrow-transition" :class="{ 'arrow-rotated': showCollections }">
                    <path fill-rule="evenodd" clip-rule="evenodd"
                        d="M8.14441 11.2896L1.49204 4.63721L2.82233 3.30692L10.1398 10.6244C10.3162 10.8009 10.4153 11.0401 10.4153 11.2896C10.4153 11.539 10.3162 11.7783 10.1398 11.9547L2.82233 19.2722L1.49204 17.9419L8.14441 11.2896Z"
                        fill="currentColor" />
                </svg>
            </div>
        </div>

        <Transition name="expand">
            <div v-if="showCollections" class="w-full mt-4 overflow-hidden max-h-[480px]">
                <TransitionGroup
                    name="collection"
                    appear
                    tag="div"
                    class="relative w-full flex flex-col gap-2"
                >
                <div v-for="(collection, index) in collections" :key="collection.id"
                    class="w-full flex flex-row items-center justify-start gap-3 px-4 py-1 rounded-full bg-white text-black transition-colors duration-250 ease-out"
                    :style="{ transitionDelay: `${index * 45}ms` }"
                    @click.stop="handleCollectionSelect(collection.id)">
                    <div class="size-5 shrink-0 aspect-square rounded border-2 flex items-center justify-center border-black transition-colors duration-250 ease-out" :class="collection.id === selectedCollectionId
                            ? ''
                            : ''
                        ">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"
                            class="transition-all duration-200 ease-out"
                            :class="collection.id === selectedCollectionId ? 'opacity-100 scale-100 text-white' : 'opacity-0 scale-75 text-transparent'">
                            <path d="M2 6.2L4.4 8.6L10 3" stroke="black" stroke-width="2" stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                    </div>
                    <p class="flex-1 min-w-0 truncate">{{ collection.name }}</p>
                </div>
                </TransitionGroup>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
    transition: max-height 0.25s ease, opacity 0.5s ease, margin-top 0.5s ease;
    opacity: 1;
}

.expand-enter-from,
.expand-leave-to {
    max-height: 0;
    opacity: 0;
    margin-top: 0;
}

.collection-enter-active,
.collection-leave-active,
.collection-appear-active {
    transition: transform 0.28s ease, opacity 0.22s ease;
}

.collection-enter-from,
.collection-leave-to,
.collection-appear-from {
    transform: translateY(-10px);
    opacity: 0;
}

.collection-move {
    transition: transform 0.28s ease;
}

.collection-leave-active {
    position: absolute;
    width: 100%;
}
</style>

<style scoped>
.arrow-transition {
    transform-origin: center;
    transition: transform 0.28s ease;
}

.arrow-rotated {
    transform: rotate(90deg);
}
</style>
