<template>
    <main class="w-full flex items-center justify-center">
        <header ref="headerEl" class="fixed top-0 w-full flex flex-col items-start justify-start z-10 bg-black">
            <div class="flex flex-row items-center w-full gap-4 p-4">
                <div class="hover:cursor-pointer" @click="navigateTo('/sets')">
                    <img src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
                </div>
                <input v-model="collection.name" ref="collectionNameInputRef" type="text" placeholder="new Card-Set"
                    @keyup.enter="($event.target as HTMLInputElement | null)?.blur()"
                    @blur="saveCollectionName(collectionId, collection.name)"
                    class="p-2 w-full text-white bg-transparent focus:outline-[#79F8B0] text-4xl font-bold">
                </input>
            </div>
            <div class="w-full flex flex-row justify-center z-10">
                <div class="w-full flex flex-row z-10 max-w-3xl">
                    <button
                        class="w-full p-3 py-4 flex flex-row justify-center items-center gap-2 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
                        :class="activeTab === 'page1'
                            ? 'text-black bg-[#79F8B0]'
                            : 'text-white bg-[#50907F] hover:bg-neutral-250'" @click="activeTab = 'page1'">
                        <span class="flex size-8 items-center justify-center bg-white rounded-full text-black">
                            {{ whiteCards.length }}
                        </span>
                        <span>
                            White Cards
                        </span>
                    </button>
                    <button
                        class="w-full px-3 py-4 flex flex-row justify-center items-center gap-2 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
                        :class="activeTab === 'page2'
                            ? 'text-black bg-[#79F8B0]'
                            : 'text-white bg-[#50907F] hover:bg-neutral-250'" @click="activeTab = 'page2'">
                        <span class="flex size-8 items-center justify-center bg-black rounded-full text-white">
                            {{ blackCards.length }}
                        </span>
                        <span>
                            Black Cards
                        </span>
                    </button>
                </div>
            </div>
        </header>

        <section class="relative flex flex-col items-center justify-start w-full h-fit max-w-3xl bg-[#79F8B0]">
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
                                    <EditorWhiteCard v-for="whiteCard in whiteCards" :key="whiteCard.id"
                                        :card="whiteCard" :editor-id="getWhiteEditorId(whiteCard.id)"
                                        :can-edit="!activeEditorId || activeEditorId === getWhiteEditorId(whiteCard.id)"
                                        @update="(text) => saveUpdate(whiteCard.id, { text, updated_at: new Date().toISOString() })"
                                        @edit-start="handleEditStart" @edit-end="handleEditEnd"
                                        @delete="deleteCard(whiteCard.id, false)" />
                                </div>
                            </div>
                            <div v-else>
                                <div class="flex flex-col gap-4">
                                    <EditorBlackCard v-for="blackCard in blackCards" :key="blackCard.id"
                                        :card="blackCard" :editor-id="getBlackEditorId(blackCard.id)"
                                        :can-edit="!activeEditorId || activeEditorId === getBlackEditorId(blackCard.id)"
                                        @update="(data) => saveUpdate(blackCard.id, { text: data.text, number_of_gaps: data.number_of_gaps, updated_at: new Date().toISOString() })"
                                        @edit-start="handleEditStart" @edit-end="handleEditEnd"
                                        @delete="deleteCard(blackCard.id, true)" />
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </div>
        </section>
        <section class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] z-20">
            <div class="w-full flex flex-row gap-4 max-w-2xl mx-auto">
                <Button v-if="isOwner" variant="primary" size="lg" class="rounded-lg" @click="addCardToSet">
                    <img src="~/assets/svg/Add.svg" alt="Add" class="h-10 w-10" />
                </Button>
            </div>
        </section>
    </main>
</template>

<script setup lang="ts">
import EditorWhiteCard from "~/components/EditorWhiteCard.vue";
import type { Tables } from "../../../types/database.types";
import EditorBlackCard from "~/components/EditorBlackCard.vue";

type Cards = Tables<"cards">;
type Collections = Tables<"collections">;

const collectionNameInputRef = ref<HTMLInputElement | null>(null);

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const collectionId = useRoute().params.collectionId as string;

const collection = ref<Collections>({} as Collections);
const whiteCards = ref<Cards[]>([]);
const blackCards = ref<Cards[]>([]);
const isLoading = ref(true);
const placeholderRows = [1, 2, 3];
const activeEditorId = ref<string | null>(null);
const isOwner = computed(() => {
    const userId = user.value?.id ?? user.value?.sub ?? null;
    return collection.value?.user_id === userId;
});

const isAdding = ref(false);

async function addCardToSet() {
    if (!isOwner.value || isAdding.value) return;
    isAdding.value = true;

    const isBlack = activeTab.value === "page2";
    const insert = {
        collection_id: collectionId,
        text: isBlack ? "New black card" : "New white card",
        is_black: isBlack,
        number_of_gaps: isBlack ? 0 : null,
    };

    const { data, error } = await supabase
        .from("cards")
        .insert(insert)
        .select("*")
        .single();

    if (!error && data) {
        if (isBlack) blackCards.value.push(data);
        else whiteCards.value.push(data);
    }

    isAdding.value = false;
}

const isUpdating = ref(false);

const activeTab = ref("page1");
const { headerEl, updateHeaderHeight } = useHeaderHeight("--sets-header-h");

const focusInput = () => {
    collectionNameInputRef.value?.focus();
};

function getWhiteEditorId(cardId: string) {
    return `white-${cardId}`;
}

function getBlackEditorId(cardId: string) {
    return `black-${cardId}`;
}

function handleEditStart(editorId: string) {
    activeEditorId.value = editorId;
}

function handleEditEnd(editorId: string) {
    if (activeEditorId.value === editorId) {
        activeEditorId.value = null;
    }
}

async function saveCollectionName(collectionId: string, name: string) {
    const trimmedName = name.trim();
    if (trimmedName === "") {
        alert("Collection name cannot be empty.");
        return;
    }

    const { error } = await supabase
        .from("collections")
        .update({ name: trimmedName, updated_at: new Date().toISOString() })
        .eq("id", collectionId);

    if (error) {
        console.error("Error updating collection name:", error);
        alert("Failed to update collection name.");
    } else {
        collection.value.name = trimmedName;
    }
}

async function saveUpdate(cardId: string, updates: any) {
    if (isUpdating.value) return;
    isUpdating.value = true;

    const { error } = await supabase
        .from("cards")
        .update(updates)
        .eq("id", cardId);

    if (error) {
        console.error("Error updating card:", error);
        alert("Failed to update card.");
    } else {
        // Update local state
        const whiteIdx = whiteCards.value.findIndex(c => c.id === cardId);
        if (whiteIdx !== -1) {
            whiteCards.value[whiteIdx] = { ...whiteCards.value[whiteIdx], ...updates };
        } else {
            const blackIdx = blackCards.value.findIndex(c => c.id === cardId);
            if (blackIdx !== -1) {
                blackCards.value[blackIdx] = { ...blackCards.value[blackIdx], ...updates };
            }
        }
    }
    isUpdating.value = false;
    return;
}

async function deleteCard(cardId: string, isBlack: boolean) {
    if (!confirm("Are you sure you want to delete this card? This action cannot be undone.")) return;

    const { error } = await supabase
        .from("cards")
        .delete()
        .eq("id", cardId);

    if (error) {
        console.error("Error deleting card:", error);
        alert("Failed to delete card.");
    } else {
        if (isBlack) {
            const editorId = getBlackEditorId(cardId);
            if (activeEditorId.value === editorId) {
                activeEditorId.value = null;
            }
            blackCards.value = blackCards.value.filter(c => c.id !== cardId);
        } else {
            const editorId = getWhiteEditorId(cardId);
            if (activeEditorId.value === editorId) {
                activeEditorId.value = null;
            }
            whiteCards.value = whiteCards.value.filter(c => c.id !== cardId);
        }
    }

    return;
}

onMounted(async () => {
    const collectionPromise = supabase
        .from("collections")
        .select("*")
        .eq("id", collectionId)
        .single();

    const whiteCardPromise = supabase
        .from("cards")
        .select("*")
        .eq("collection_id", collectionId)
        .eq("is_black", false);

    const blackCardPromise = supabase
        .from("cards")
        .select("*")
        .eq("collection_id", collectionId)
        .eq("is_black", true);

    try {
        const [collectionResult, whiteCardResult, blackCardResult] = await Promise.all([

            collectionPromise,
            whiteCardPromise,
            blackCardPromise,
        ]);

        if (collectionResult.error) {
            console.error("Error fetching user collections:", collectionResult.error);
        } else {
            collection.value = (collectionResult.data ?? {}) as Collections;
        }

        if (whiteCardResult.error) {
            console.error("Error fetching user collections:", whiteCardResult.error);
        } else {
            whiteCards.value = (whiteCardResult.data ?? []) as Cards[];
        }

        if (blackCardResult.error) {
            console.error("Error fetching public collections:", blackCardResult.error);
        } else {
            blackCards.value = (blackCardResult.data ?? []) as Cards[];
        }
    } finally {
        isLoading.value = false;
    }
});
</script>

<style scoped>
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
