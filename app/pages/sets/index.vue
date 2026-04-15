<template>
    <main class="w-full flex items-center justify-center text-white">
        <header ref="headerEl" class="fixed top-0 w-full flex flex-col items-start justify-start z-10 bg-black">
            <div class="flex flex-row items-center w-full gap-4 p-4">
                <div class="cursor-pointer" @click="navigateTo('/')">
                    <img src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
                </div>
                <p class="text-4xl font-bold">Sets</p>
            </div>
            <div class="w-full flex flex-row justify-center z-10">
                <div class="w-full flex flex-row z-10 max-w-3xl">
                    <button
                        class="w-full px-3 py-4 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
                        :class="activeTab === 'page1'
                            ? 'text-black bg-[#FFA3C0]'
                            : 'text-white bg-[#C06F9B] hover:bg-neutral-250'" @click="activeTab = 'page1'">
                        My Sets
                    </button>
                    <button
                        class="w-full px-3 py-4 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
                        :class="activeTab === 'page2'
                            ? 'text-black bg-[#FFA3C0]'
                            : 'text-white bg-[#C06F9B] hover:bg-neutral-250'" @click="activeTab = 'page2'">
                        Available Sets
                    </button>
                </div>

            </div>
        </header>

        <section class="relative flex flex-col items-center justify-start w-full h-fit max-w-3xl bg-[#FFA3C0]">
            <div class="flex flex-col h-full w-full mt-[var(--sets-header-h)]">

                <div class="h-fit flex flex-col p-4 min-h-screen">
                    <div v-if="isLoading" class="flex flex-col gap-4 animate-pulse">
                        <div v-for="n in placeholderRows" :key="n"
                            class="w-full flex items-center gap-4 bg-neutral-100 p-5 rounded-lg border-[3px] border-black/20">
                            <div class="h-9 w-9 rounded bg-neutral-200" />
                            <div class="h-6 w-1/3 rounded bg-neutral-200" />
                            <div class="ml-auto h-6 w-6 rounded bg-neutral-200" />
                        </div>
                    </div>

                    <Transition v-else name="tab-fade" mode="out-in">
                        <div :key="activeTab">
                            <div v-if="activeTab === 'page1'">
                                <div class="flex flex-col gap-4">
                                    <div v-for="collection in userCollections" :key="collection.id"
                                        @click="navigateTo('/sets/' + collection.id)"
                                        class="relative w-full flex flex-row items-center gap-4 bg-neutral-50 py-5 px-2 rounded-lg border-[3px] border-black hover:cursor-pointer">
                                        <img src="~/assets/svg/card-set-icon.svg" alt="Card Set" class="h-12 w-12" />
                                        <p class="text-black text-xl font-semibold">{{ collection.name }}</p>
                                        <div class="absolute top-2 right-1 hover:cursor-pointer"
                                            @click.stop="openSetMenu(collection)">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29"
                                                viewBox="0 0 29 29" fill="none">
                                                <path
                                                    d="M16.7562 6.75327C16.7563 7.04965 16.698 7.34315 16.5846 7.61701C16.4713 7.89087 16.3051 8.13973 16.0956 8.34937C15.8861 8.55901 15.6374 8.72534 15.3636 8.83884C15.0898 8.95235 14.7963 9.01083 14.5 9.01092C14.2036 9.01102 13.9101 8.95273 13.6362 8.8394C13.3624 8.72607 13.1135 8.5599 12.9039 8.3504C12.6942 8.14089 12.5279 7.89214 12.4144 7.61835C12.3009 7.34457 12.2424 7.0511 12.2423 6.75472C12.2421 6.15615 12.4797 5.58201 12.9028 5.15862C13.326 4.73523 13.8999 4.49726 14.4985 4.49707C15.0971 4.49688 15.6712 4.73448 16.0946 5.1576C16.518 5.58072 16.756 6.1547 16.7562 6.75327Z"
                                                    fill="black" />
                                                <path
                                                    d="M14.5 16.7553C15.746 16.7553 16.7562 15.7452 16.7562 14.4991C16.7562 13.2531 15.746 12.2429 14.5 12.2429C13.2539 12.2429 12.2438 13.2531 12.2438 14.4991C12.2438 15.7452 13.2539 16.7553 14.5 16.7553Z"
                                                    fill="black" />
                                                <path
                                                    d="M14.5 24.5026C15.746 24.5026 16.7562 23.4925 16.7562 22.2464C16.7562 21.0004 15.746 19.9902 14.5 19.9902C13.2539 19.9902 12.2438 21.0004 12.2438 22.2464C12.2438 23.4925 13.2539 24.5026 14.5 24.5026Z"
                                                    fill="black" />
                                            </svg>
                                        </div>
                                        <Transition name="card-menu">
                                            <div v-if="showSetMenu && activeSet?.id === collection.id"
                                                class="absolute right-1 top-10 z-50 min-w-[25dvw] rounded-lg bg-white p-1 text-black border-[3px] border-black"
                                                @click.stop>
                                                <div class="flex flex-col items-start gap-1">
                                                    <button
                                                        class="w-full hover:bg-black/10 text-left text-lg py-2 px-1 rounded"
                                                        @click="renameSet">Rename</button>
                                                    <div class="bg-black w-full h-[2px]" />
                                                    <button
                                                        class="w-full hover:bg-red-500/10 text-left text-lg py-2 px-1 rounded"
                                                        @click="openDeleteConfirm">Delete</button>
                                                </div>
                                            </div>
                                        </Transition>
                                    </div>
                                </div>
                            </div>
                            <div v-else>
                                <div class="flex flex-col gap-4">
                                    <div v-for="collection in publicCollections" :key="collection.id"
                                        class="relative w-full flex flex-row items-center gap-4 bg-neutral-50 py-5 px-2 rounded-lg border-[3px] border-black hover:cursor-pointer">
                                        <img src="~/assets/svg/card-set-icon.svg" alt="Card Set" class="h-12 w-12" />
                                        <p class="text-black text-xl font-semibold">{{ collection.name }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </div>
        </section>
        <!-- Set actions overlay -->
        <Transition name="menu-backdrop">
            <div v-if="showSetMenu" class="fixed inset-0 z-40" @click="closeSetMenu" />
        </Transition>

        <!-- Delete confirm overlay -->
        <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 bg-black/40" @click="showDeleteConfirm = false">
            <div class="absolute inset-0 flex items-center justify-center p-8">
                <div class="bg-white text-black flex flex-col rounded-lg p-6 w-full max-w-xs">
                    <p class="font-semibold text-2xl">Do you want to delete this set?</p>
                    <div class="mt-16 flex flex-row justify-between w-full gap-8">
                        <Button size="md" variant="secondary" class="rounded" block
                            @click="showDeleteConfirm = false">No</Button>
                        <Button size="md" variant="primary" class="rounded" block @click="confirmDelete">Yes</Button>
                    </div>
                </div>
            </div>
        </div>
        <section v-if="activeTab === 'page1'" class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] z-20">
            <div class="w-full max-w-2xl mx-auto">
                <Button variant="primary" size="lg" class="rounded-lg" @click="navigateTo('/sets/create')">
                    <template #iconLeft>
                        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none">
                            <path d="M12 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                            <path d="M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                    </template>
                </Button>
            </div>
        </section>
    </main>
</template>

<script setup lang="ts">
import type { Tables } from "../../../types/database.types";

const supabase = useSupabaseClient();
const user = useSupabaseUser();


const userCollections = ref<CardCollections[]>([]);
const publicCollections = ref<CardCollections[]>([]);
const isLoading = ref(true);
const placeholderRows = [1, 2, 3];

const showSetMenu = ref(false);
const showDeleteConfirm = ref(false);
const activeSet = ref<CardCollections | null>(null);

type CardCollections = Tables<"collections">;

const activeTab = ref("page1");
const { headerEl, updateHeaderHeight } = useHeaderHeight("--sets-header-h");

function openSetMenu(collection: CardCollections) {
    activeSet.value = collection;
    showSetMenu.value = true;
}

function closeSetMenu() {
    showSetMenu.value = false;
}

function openDeleteConfirm() {
    showSetMenu.value = false;
    showDeleteConfirm.value = true;
}

async function renameSet() {
    if (!activeSet.value) return;
    const userId = user.value?.id ?? user.value?.sub;
    if (!userId) return;

    const currentName = activeSet.value.name ?? "";
    const nextName = window.prompt("Enter a new set name", currentName);
    if (nextName === null) {
        showSetMenu.value = false;
        return;
    }

    const trimmed = nextName.trim();
    if (!trimmed) return;

    await supabase
        .from("collections")
        .update({ name: trimmed, updated_at: new Date().toISOString() })
        .eq("id", activeSet.value.id)
        .eq("user_id", userId);

    const idx = userCollections.value.findIndex(c => c.id === activeSet.value?.id);
    const selectedCollection = idx !== -1 ? userCollections.value[idx] : null;
    if (selectedCollection) selectedCollection.name = trimmed;
    showSetMenu.value = false;
}
async function confirmDelete() {
    if (!activeSet.value) return;
    const userId = user.value?.id ?? user.value?.sub;
    if (!userId) return;

    const { data, error } = await supabase
        .from("collections")
        .delete()
        .eq("id", activeSet.value.id)
        .eq("user_id", userId);

    if (error) {
        console.error("Error deleting cards:", error);
        return;
    };
    console.log("Deleted collection:", data);
    userCollections.value = userCollections.value.filter(c => c.id !== activeSet.value?.id);
    showDeleteConfirm.value = false;
}

onMounted(async () => {
    const userId = user.value?.id ?? user.value?.sub;

    const userCollectionsPromise = userId
        ? supabase
            .from("collections")
            .select("*")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null });

    const publicCollectionsPromise = supabase
        .from("collections")
        .select("*")
        .is("user_id", null);

    try {
        const [userResult, publicResult] = await Promise.all([
            userCollectionsPromise,
            publicCollectionsPromise,
        ]);

        if (userResult.error) {
            console.error("Error fetching user collections:", userResult.error);
        } else {
            userCollections.value = (userResult.data ?? []) as CardCollections[];
        }

        if (publicResult.error) {
            console.error("Error fetching public collections:", publicResult.error);
        } else {
            publicCollections.value = (publicResult.data ?? []) as CardCollections[];
        }
    } finally {
        isLoading.value = false;
    }
});
</script>

<style scoped>
.card-menu-enter-active,
.card-menu-leave-active {
    transition: opacity 160ms ease, transform 160ms ease;
    transform-origin: top right;
}

.card-menu-enter-from,
.card-menu-leave-to {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
}

.card-menu-enter-to,
.card-menu-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
}

.menu-backdrop-enter-active,
.menu-backdrop-leave-active {
    transition: opacity 160ms ease;
}

.menu-backdrop-enter-from,
.menu-backdrop-leave-to {
    opacity: 0;
}

.menu-backdrop-enter-to,
.menu-backdrop-leave-from {
    opacity: 1;
}

.tab-fade-enter-active,
.tab-fade-leave-active {
    transition: opacity 180ms ease, transform 180ms ease;
}

.tab-fade-enter-from,
.tab-fade-leave-to {
    opacity: 0;
    transform: translateY(6px);
}

.tab-fade-enter-to,
.tab-fade-leave-from {
    opacity: 1;
    transform: translateY(0);
}
</style>
