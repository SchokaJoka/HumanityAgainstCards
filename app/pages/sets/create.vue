<template>
    <main class="w-full flex items-center justify-center bg-black">
        <header ref="headerEl" class="fixed top-0 w-full flex flex-col items-start justify-start z-10 bg-black">
            <div class="flex flex-row items-center w-full gap-4 p-4">
                <div class="cursor-pointer" @click="leavePage">
                    <img src="~/assets/svg/back.svg" alt="Back" class="h-8 w-10" />
                </div>
                <input v-model="collectionName" type="text" placeholder="new Card-Set"
                    class="w-full text-white bg-transparent focus:outline-[#79F8B0] text-4xl font-bold"></input>
            </div>
            <div class="w-full flex flex-row justify-center z-10">
                <div class="w-full flex flex-row z-10 max-w-3xl">
                    <button
                        class="w-full px-3 py-4 flex flex-row justify-center items-center gap-2 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
                        :class="activeTab === 'page1'
                            ? 'text-black bg-[#79F8B0]'
                            : 'text-white bg-[#50907F] hover:bg-neutral-250'" @click="activeTab = 'page1'">
                        <span class="flex size-8 items-center justify-center rounded-full text-black bg-white">
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

                <div class="h-fit flex flex-col p-4 pb-32 min-h-screen">
                    <Transition name="tab-fade" mode="out-in">
                        <div :key="activeTab">
                            <div v-if="activeTab === 'page1'">
                                <div class="flex flex-col gap-4">
                                    <div v-for="whiteCard, index in whiteCards" :key="index"
                                        :ref="setEditorEl(getWhiteEditorId(index))" class="w-full">
                                        <EditorWhiteCard :card="whiteCard" :editor-id="getWhiteEditorId(index)"
                                            :can-edit="!activeEditorId || activeEditorId === getWhiteEditorId(index)"
                                            :auto-edit="autoEditId === getWhiteEditorId(index)"
                                            @update="(text) => whiteCards[index].text = text"
                                            @edit-start="handleEditStart" @edit-end="handleEditEnd"
                                            @delete="deleteCard(index, 'white')" />
                                    </div>
                                </div>
                            </div>
                            <div v-else>
                                <div class="flex flex-col gap-4">
                                    <div v-for="blackCard, index in blackCards" :key="index"
                                        :ref="setEditorEl(getBlackEditorId(index))" class="w-full">
                                        <EditorBlackCard :card="blackCard" :editor-id="getBlackEditorId(index)"
                                            :can-edit="!activeEditorId || activeEditorId === getBlackEditorId(index)"
                                            :auto-edit="autoEditId === getBlackEditorId(index)"
                                            @update="(data) => { blackCards[index].text = data.text; blackCards[index].number_of_gaps = data.number_of_gaps }"
                                            @edit-start="handleEditStart" @edit-end="handleEditEnd"
                                            @delete="deleteCard(index, 'black')" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </div>
        </section>

        <section class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] z-20">
            <div class="w-full flex flex-row gap-4 max-w-2xl mx-auto">
                <Button variant="primary" size="lg" @click="activeTab === 'page1' ? newWhiteCard() : newBlackCard()"
                    class="rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19" stroke="black" stroke-width="2" stroke-linecap="round" />
                        <path d="M5 12H19" stroke="black" stroke-width="2" stroke-linecap="round" />
                    </svg>
                </Button>
                <Button v-if="hasUnsavedChanges" variant="primary" class="rounded-lg" size="lg"
                    @click="saveCollection()">
                    Save
                </Button>
            </div>
        </section>
    </main>
</template>

<script setup lang="ts">
import EditorWhiteCard from "~/components/EditorWhiteCard.vue";
import type { Tables } from "../../../types/database.types";
import EditorBlackCard from "~/components/EditorBlackCard.vue";

type Card = Tables<"cards">;

const supabase = useSupabaseClient();
const user = useSupabaseUser();

const collectionName = ref<string>("");
const whiteCards = ref<Card[]>([]);
const blackCards = ref<Card[]>([]);
const activeEditorId = ref<string | null>(null);
const autoEditId = ref<string | null>(null);
const editorEls = new Map<string, HTMLElement>();

const activeTab = ref("page1");
const { headerEl, updateHeaderHeight } = useHeaderHeight("--sets-header-h");

const hasUnsavedChanges = computed(() =>
    whiteCards.value.length > 0 ||
    blackCards.value.length > 0 ||
    collectionName.value.trim() !== ""
);


function getWhiteEditorId(index: number) {
    return `white-${index}`;
}

function getBlackEditorId(index: number) {
    return `black-${index}`;
}

function handleEditStart(editorId: string) {
    activeEditorId.value = editorId;
    scrollToEditor(editorId);
}

function handleEditEnd(editorId: string) {
    if (activeEditorId.value === editorId) {
        activeEditorId.value = null;
    }
}

function setEditorEl(editorId: string) {
    return (el: HTMLElement | null) => {
        if (el) {
            editorEls.set(editorId, el);
        } else {
            editorEls.delete(editorId);
        }
    };
}

function scrollToEditor(editorId: string) {
    nextTick(() => {
        const el = editorEls.get(editorId);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "end" });
    });
}

function scrollToPageBottom() {
    const scroller = document.scrollingElement ?? document.documentElement;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
        });
    });
}

function deleteCard(index: number, type: "white" | "black") {
    if (confirm("Are you sure you want to delete this card? This action cannot be undone.")) {
        if (type === "white") {
            if (activeEditorId.value === getWhiteEditorId(index)) {
                activeEditorId.value = null;
            }
            whiteCards.value.splice(index, 1);
        } else {
            if (activeEditorId.value === getBlackEditorId(index)) {
                activeEditorId.value = null;
            }
            blackCards.value.splice(index, 1);
        }
    }
}
function triggerAutoEdit(editorId: string) {
    activeEditorId.value = editorId; // make canEdit true for that card
    autoEditId.value = editorId;
    nextTick(() => {
        scrollToPageBottom();
        autoEditId.value = null;
    });
}

function newWhiteCard() {
    whiteCards.value.push({

        text: `New white card ${whiteCards.value.length + 1}`,
        is_black: false,
    } as Card);
    const index = whiteCards.value.length - 1;
    triggerAutoEdit(getWhiteEditorId(index));
}

function newBlackCard() {
    blackCards.value.push({
        text: `New Black card ${blackCards.value.length + 1}`,
        is_black: true,
        number_of_gaps: 0,
    } as Card);
    const index = blackCards.value.length - 1;
    triggerAutoEdit(getBlackEditorId(index));
}

async function saveCollection() {
    if (collectionName.value.trim() === "") {
        alert("Collection name cannot be empty.");
        return;
    }

    if (whiteCards.value.length === 0 && blackCards.value.length === 0) {
        alert("Please add at least one card to the collection.");
        return;
    }

    const { data, error } = await supabase
        .from("collections")
        .insert({
            name: collectionName.value,
            user_id: user.value?.id || user.value?.sub,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

    if (error) {
        console.error("Error creating collection:", error);
        alert("An error occurred while creating the collection. Please try again.");
        return;
    }

    const collectionId = data.id;
    const cardsToInsert = [
        ...whiteCards.value.map(card => ({ ...card, collection_id: collectionId })),
        ...blackCards.value.map(card => ({ ...card, collection_id: collectionId })),
    ];

    const { error: cardsError } = await supabase
        .from("cards")
        .insert(cardsToInsert);

    if (cardsError) {
        console.error("Error creating cards:", cardsError);
        alert("An error occurred while creating the cards. Please try again.");
        return;
    }

    alert("Collection created successfully!");
    collectionName.value = "";
    whiteCards.value = [];
    blackCards.value = [];
    navigateTo('/sets');
}

const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges.value) {
        e.preventDefault();
    }
};

function leavePage() {
    if (hasUnsavedChanges.value && !confirm("You have unsaved changes. Are you sure you want to leave?")) {
        return;
    }
    navigateTo('/sets');
}

onMounted(() => {
    window.addEventListener("beforeunload", beforeUnloadHandler);
});

watch(activeTab, () => {
    activeEditorId.value = null;
});

onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
});
</script>
