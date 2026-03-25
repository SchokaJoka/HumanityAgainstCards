<template>
    <header class="fixed top-0 w-full flex flex-row items-center justify-start gap-4 p-4 bg-white z-10">
        <div class="cursor-pointer" @click="navigateTo('/')">
            <svg xmlns="http://www.w3.org/2000/svg" width="38" height="33" viewBox="0 0 38 33" fill="none">
                <path
                    d="M37 31.8505C32.596 26.4042 28.6852 23.314 25.2676 22.5797C21.85 21.8454 18.5962 21.7345 15.5062 22.2469V32L1 16.0852L15.5062 1.00003V10.2699C21.22 10.3155 26.0776 12.3922 30.079 16.5C34.0798 20.6078 36.3868 25.7247 37 31.8505Z"
                    stroke="black" stroke-width="2" stroke-linejoin="round" />
            </svg>
        </div>
        <p class="text-black text-4xl font-bold">Sets</p>
    </header>

    <main class="relative flex flex-col items-center justify-start h-dvh w-full max-w-2xl pt-4 overflow-clip">
        <div class="w-full min-h-[3rem] mb-5">
        </div>

        <div class="flex flex-col h-full w-full">
            <div class="flex flex-row rounded-t-lg overflow-hidden shadow-sm">
                <button class="w-full px-3 py-4 text-xl font-semibold transition-all duration-300 ease-out"
                    :class="activeTab === 'page1'
                        ? 'text-black bg-neutral-300 scale-[1.01]'
                        : 'text-white bg-neutral-200 hover:bg-neutral-250'"
                    @click="activeTab = 'page1'">
                    My Sets
                </button>
                <button class="w-full px-3 py-4 text-xl font-semibold transition-all duration-300 ease-out"
                    :class="activeTab === 'page2'
                        ? 'text-black bg-neutral-300 scale-[1.01]'
                        : 'text-white bg-neutral-200 hover:bg-neutral-250'"
                    @click="activeTab = 'page2'">
                    Available Sets
                </button>
            </div>

            <div class="flex flex-col h-full p-4 overflow-auto bg-neutral-300">
                <div v-if="isLoading" class="flex flex-col gap-4 animate-pulse">
                    <div v-for="n in placeholderRows" :key="n"
                        class="w-full flex items-center gap-4 bg-neutral-100 p-5 rounded-lg border border-[3px] border-black/20">
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
                                    class="relative w-full flex flex-row items-center gap-4 bg-neutral-50 p-5 rounded-lg border border-[3px] border-black hover:cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="37" height="37" viewBox="0 0 37 37"
                                        fill="none">
                                        <path d="M24.6666 4.625H6.16663V24.6667" stroke="black" stroke-width="2"
                                            stroke-linecap="round" stroke-linejoin="round" />
                                        <path
                                            d="M12.3333 10.7917H30.8333V29.2917C30.8333 30.1095 30.5084 30.8938 29.9302 31.472C29.3519 32.0502 28.5677 32.3751 27.7499 32.3751H15.4166C14.5988 32.3751 13.8146 32.0502 13.2363 31.472C12.6581 30.8938 12.3333 30.1095 12.3333 29.2917V10.7917Z"
                                            stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                    <p class="text-black text-xl font-semibold">{{ collection.name }}</p>
                                    <div class="absolute top-2 right-1 hover:cursor-pointer" @click="">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 29 29"
                                            fill="none">
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
                                </div>
                            </div>
                        </div>
                        <div v-else>
                            <div class="flex flex-col gap-4">
                                <div v-for="collection in publicCollections" :key="collection.id"
                                    class="relative w-full flex flex-row items-center gap-4 bg-neutral-50 p-5 rounded-lg border border-[3px] border-black hover:cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="37" height="37" viewBox="0 0 37 37"
                                        fill="none">
                                        <path d="M24.6666 4.625H6.16663V24.6667" stroke="black" stroke-width="2"
                                            stroke-linecap="round" stroke-linejoin="round" />
                                        <path
                                            d="M12.3333 10.7917H30.8333V29.2917C30.8333 30.1095 30.5084 30.8938 29.9302 31.472C29.3519 32.0502 28.5677 32.3751 27.7499 32.3751H15.4166C14.5988 32.3751 13.8146 32.0502 13.2363 31.472C12.6581 30.8938 12.3333 30.1095 12.3333 29.2917V10.7917Z"
                                            stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                    <p class="text-black text-xl font-semibold">{{ collection.name }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </div>
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

type CardCollections = Tables<"collections">;

const activeTab = ref("page1");


onMounted(async () => {
    console.log("Current user:", user.value);
    const userId = user.value?.id ?? user.value?.sub;

    const userCollectionsPromise = userId
        ? supabase
            .from("collections")
            .select("*")
            .eq("user_id", userId)
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

        console.log("Fetched user collections:", userCollections.value);
        console.log("Fetched public collections:", publicCollections.value);
    } finally {
        isLoading.value = false;
    }
});
</script>

<style scoped>
.tab-fade-enter-active,
.tab-fade-leave-active {
    transition: opacity 220ms ease, transform 220ms ease;
}

.tab-fade-enter-from,
.tab-fade-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>
