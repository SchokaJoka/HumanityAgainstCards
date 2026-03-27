<template>
    <main class="w-full flex items-center justify-center">
        <header ref="headerEl" class="fixed top-0 w-full flex flex-col items-start justify-start z-10">
            <div class="flex flex-row items-center w-full gap-4 p-4 bg-white">
                <div class="cursor-pointer" @click="leavePage">
                    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="33" viewBox="0 0 38 33" fill="none">
                        <path
                            d="M37 31.8505C32.596 26.4042 28.6852 23.314 25.2676 22.5797C21.85 21.8454 18.5962 21.7345 15.5062 22.2469V32L1 16.0852L15.5062 1.00003V10.2699C21.22 10.3155 26.0776 12.3922 30.079 16.5C34.0798 20.6078 36.3868 25.7247 37 31.8505Z"
                            stroke="black" stroke-width="2" stroke-linejoin="round" />
                    </svg>
                </div>
                <input v-model="collectionName" type="text" placeholder="new Card-Set"
                    class="w-full text-black text-4xl font-bold"></input>
            </div>
            <div class="w-full flex flex-row justify-center bg-white z-10">
                <div class="w-full flex flex-row bg-white z-10 max-w-3xl">
                    <button
                        class="w-full px-3 py-4 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
                        :class="activeTab === 'page1'
                            ? 'text-black bg-neutral-300'
                            : 'text-white bg-neutral-200 hover:bg-neutral-250'" @click="activeTab = 'page1'">
                        White Cards
                    </button>
                    <button
                        class="w-full px-3 py-4 text-xl font-semibold rounded-t-lg transition-all duration-300 ease-out"
                        :class="activeTab === 'page2'
                            ? 'text-black bg-neutral-300'
                            : 'text-white bg-neutral-200 hover:bg-neutral-250'" @click="activeTab = 'page2'">
                        Black Cards
                    </button>
                </div>
            </div>
        </header>

        <section class="relative flex flex-col items-center justify-start w-full h-fit max-w-3xl bg-neutral-300">
            <div class="flex flex-col h-full w-full mt-[var(--sets-header-h)]">

                <div class="h-fit flex flex-col p-4 min-h-screen">
                    <Transition name="tab-fade" mode="out-in">
                        <div :key="activeTab">
                            <div v-if="activeTab === 'page1'">
                                <div class="flex flex-col gap-4">
                                    <div v-for="whiteCard, index in whiteCards" :key="index"
                                        class="relative w-full flex flex-row items-center justify-between gap-4 bg-neutral-50 p-5 rounded-lg border border-[3px] border-black">
                                        <p v-if="editType !== 'white' || editIndex !== index"
                                            class="w-full text-black text-xl font-semibold">{{ whiteCard.text }}</p>
                                        <input v-else ref="editInputWhite" v-model="whiteCards[index].text"
                                            @keyup.enter="saveEdit()" @blur="saveEdit()" type="text"
                                            class="w-full text-black text-xl font-semibold bg-transparent border-none focus:ring-0"></input>
                                        <div class="flex flex-row gap-2 items-center">
                                            <div class="hover:cursor-pointer"
                                                @click="editCard(whiteCard, index, 'white')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                                                    viewBox="0 0 24 24" fill="none">
                                                    <g clip-path="url(#clip0_83_1922)">
                                                        <path d="M6 24H0V18M21 9L15 3L18 0L24 6M9 21L3 15L12 6L18 12"
                                                            fill="black" />
                                                    </g>
                                                    <defs>
                                                        <clipPath id="clip0_83_1922">
                                                            <rect width="24" height="24" fill="white" />
                                                        </clipPath>
                                                    </defs>
                                                </svg>
                                            </div>
                                            <div class="hover:cursor-pointer" @click="deleteCard(index, 'white')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                                                    viewBox="0 0 24 24" fill="none">
                                                    <path
                                                        d="M20.0001 6C20.255 6.00028 20.5001 6.09788 20.6855 6.27285C20.8708 6.44782 20.9823 6.68695 20.9973 6.94139C21.0122 7.19584 20.9294 7.44638 20.7658 7.64183C20.6023 7.83729 20.3702 7.9629 20.1171 7.993L20.0001 8H19.9191L19.0001 19C19.0002 19.7652 18.7078 20.5015 18.1828 21.0583C17.6579 21.615 16.94 21.9501 16.1761 21.995L16.0001 22H8.00011C6.40211 22 5.09611 20.751 5.00811 19.25L5.00311 19.083L4.08011 8H4.00011C3.74523 7.99972 3.50008 7.90212 3.31474 7.72715C3.12941 7.55218 3.01788 7.31305 3.00294 7.05861C2.988 6.80416 3.07079 6.55362 3.23438 6.35817C3.39797 6.16271 3.63002 6.0371 3.88311 6.007L4.00011 6H20.0001ZM10.0001 10C9.7349 10 9.48054 10.1054 9.29301 10.2929C9.10547 10.4804 9.00011 10.7348 9.00011 11V17C9.00011 17.2652 9.10547 17.5196 9.29301 17.7071C9.48054 17.8946 9.7349 18 10.0001 18C10.2653 18 10.5197 17.8946 10.7072 17.7071C10.8948 17.5196 11.0001 17.2652 11.0001 17V11C11.0001 10.7348 10.8948 10.4804 10.7072 10.2929C10.5197 10.1054 10.2653 10 10.0001 10ZM14.0001 10C13.7349 10 13.4805 10.1054 13.293 10.2929C13.1055 10.4804 13.0001 10.7348 13.0001 11V17C13.0001 17.2652 13.1055 17.5196 13.293 17.7071C13.4805 17.8946 13.7349 18 14.0001 18C14.2653 18 14.5197 17.8946 14.7072 17.7071C14.8948 17.5196 15.0001 17.2652 15.0001 17V11C15.0001 10.7348 14.8948 10.4804 14.7072 10.2929C14.5197 10.1054 14.2653 10 14.0001 10ZM14.0001 2C14.5305 2 15.0393 2.21071 15.4143 2.58579C15.7894 2.96086 16.0001 3.46957 16.0001 4C15.9998 4.25488 15.9022 4.50003 15.7273 4.68537C15.5523 4.8707 15.3132 4.98223 15.0587 4.99717C14.8043 5.01211 14.5537 4.92933 14.3583 4.76574C14.1628 4.60214 14.0372 4.3701 14.0071 4.117L14.0001 4H10.0001L9.99311 4.117C9.96301 4.3701 9.8374 4.60214 9.64195 4.76574C9.44649 4.92933 9.19595 5.01211 8.94151 4.99717C8.68707 4.98223 8.44793 4.8707 8.27296 4.68537C8.09799 4.50003 8.0004 4.25488 8.00011 4C7.99995 3.49542 8.19052 3.00943 8.53361 2.63945C8.8767 2.26947 9.34696 2.04284 9.85011 2.005L10.0001 2H14.0001Z"
                                                        fill="black" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div v-else>
                                <div class="flex flex-col gap-4">
                                    <div v-for="blackCard, index in blackCards" :key="index"
                                        class="relative w-full flex flex-row items-center justify-between gap-4 bg-black p-5 rounded-lg border border-[3px] border-white">
                                        <p v-if="editType !== 'black' || editIndex !== index"
                                            class="w-full text-white text-xl font-semibold">{{ blackCard.text }}</p>
                                        <div v-else
                                            class="w-full flex flex-col gap-2">
                                            <div v-for="part, index in currentBlackCardText" :key="index" class="w-full flex flex-row gap-4">
                                                <span v-if="part.isGap" class="text-white">{{ "GAP" }}</span>
                                                <input v-else type="text" v-model="part.text" class="flex-1 bg-white text-black px-2 py-1 rounded" />
                                            </div>
                                            <div class="w-full flex flex-row gap-2">
                                                <Button v-if="!currentBlackCardText[currentBlackCardText.length - 1].isGap" @click="insertGap()" variant="primary" size="sm" block class="rounded-xl">Insert Gap</Button>
                                                <Button v-if="currentBlackCardText[currentBlackCardText.length - 1].isGap" @click="insertText()" variant="primary" size="sm" block class="rounded-xl">Insert Text</Button>
                                                <Button v-if="currentBlackCardText.length > 1" @click="deleteLast()" variant="primary" size="sm" block class="rounded-xl">Delete</Button>
                                            </div>
                                        </div>
                                        <div class="flex flex-row gap-2 items-center">
                                            <div class="hover:cursor-pointer"
                                                @click="editCard(blackCard, index, 'black')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                                                    viewBox="0 0 24 24" fill="none">
                                                    <g clip-path="url(#clip0_83_1922)">
                                                        <path d="M6 24H0V18M21 9L15 3L18 0L24 6M9 21L3 15L12 6L18 12"
                                                            fill="white" />
                                                    </g>
                                                    <defs>
                                                        <clipPath id="clip0_83_1922">
                                                            <rect width="24" height="24" fill="black" />
                                                        </clipPath>
                                                    </defs>
                                                </svg>
                                            </div>
                                            <div class="hover:cursor-pointer" @click="deleteCard(index, 'black')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                                                    viewBox="0 0 24 24" fill="none">
                                                    <path
                                                        d="M20.0001 6C20.255 6.00028 20.5001 6.09788 20.6855 6.27285C20.8708 6.44782 20.9823 6.68695 20.9973 6.94139C21.0122 7.19584 20.9294 7.44638 20.7658 7.64183C20.6023 7.83729 20.3702 7.9629 20.1171 7.993L20.0001 8H19.9191L19.0001 19C19.0002 19.7652 18.7078 20.5015 18.1828 21.0583C17.6579 21.615 16.94 21.9501 16.1761 21.995L16.0001 22H8.00011C6.40211 22 5.09611 20.751 5.00811 19.25L5.00311 19.083L4.08011 8H4.00011C3.74523 7.99972 3.50008 7.90212 3.31474 7.72715C3.12941 7.55218 3.01788 7.31305 3.00294 7.05861C2.988 6.80416 3.07079 6.55362 3.23438 6.35817C3.39797 6.16271 3.63002 6.0371 3.88311 6.007L4.00011 6H20.0001ZM10.0001 10C9.7349 10 9.48054 10.1054 9.29301 10.2929C9.10547 10.4804 9.00011 10.7348 9.00011 11V17C9.00011 17.2652 9.10547 17.5196 9.29301 17.7071C9.48054 17.8946 9.7349 18 10.0001 18C10.2653 18 10.5197 17.8946 10.7072 17.7071C10.8948 17.5196 11.0001 17.2652 11.0001 17V11C11.0001 10.7348 10.8948 10.4804 10.7072 10.2929C10.5197 10.1054 10.2653 10 10.0001 10ZM14.0001 10C13.7349 10 13.4805 10.1054 13.293 10.2929C13.1055 10.4804 13.0001 10.7348 13.0001 11V17C13.0001 17.2652 13.1055 17.5196 13.293 17.7071C13.4805 17.8946 13.7349 18 14.0001 18C14.2653 18 14.5197 17.8946 14.7072 17.7071C14.8948 17.5196 15.0001 17.2652 15.0001 17V11C15.0001 10.7348 14.8948 10.4804 14.7072 10.2929C14.5197 10.1054 14.2653 10 14.0001 10ZM14.0001 2C14.5305 2 15.0393 2.21071 15.4143 2.58579C15.7894 2.96086 16.0001 3.46957 16.0001 4C15.9998 4.25488 15.9022 4.50003 15.7273 4.68537C15.5523 4.8707 15.3132 4.98223 15.0587 4.99717C14.8043 5.01211 14.5537 4.92933 14.3583 4.76574C14.1628 4.60214 14.0372 4.3701 14.0071 4.117L14.0001 4H10.0001L9.99311 4.117C9.96301 4.3701 9.8374 4.60214 9.64195 4.76574C9.44649 4.92933 9.19595 5.01211 8.94151 4.99717C8.68707 4.98223 8.44793 4.8707 8.27296 4.68537C8.09799 4.50003 8.0004 4.25488 8.00011 4C7.99995 3.49542 8.19052 3.00943 8.53361 2.63945C8.8767 2.26947 9.34696 2.04284 9.85011 2.005L10.0001 2H14.0001Z"
                                                        fill="white" />
                                                </svg>
                                            </div>
                                        </div>
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
                <Button variant="secondary" size="md" @click="activeTab === 'page1' ? newWhiteCard() : newBlackCard()">
                    <template #iconLeft>
                        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none">
                            <path d="M12 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                            <path d="M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                    </template>
                </Button>
                <Button v-if="hasUnsavedChanges" variant="tertiary" size="md" @click="saveCollection">
                    Save
                </Button>
            </div>
        </section>
    </main>
</template>

<script setup lang="ts">

/*

*/
import type { Tables } from "../../../types/database.types";

const supabase = useSupabaseClient();
const user = useSupabaseUser();

const collectionName = ref<string>("");
const whiteCards = ref<Card[]>([]);
const blackCards = ref<Card[]>([]);
const placeholderRows = [1, 2, 3];

const editIndex = ref<number | null>(null);
const editType = ref<"white" | "black" | null>(null);
const editInputWhite = ref<HTMLInputElement | HTMLInputElement[] | null>(null);
const editInputBlack = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const currentBlackCardText = ref<[]>([]);

const GAP_TOKEN: string = "[[W1tnYXBdXQ==]]";

type Card = Tables<"cards">;

const activeTab = ref("page1");
const { headerEl, updateHeaderHeight } = useHeaderHeight("--sets-header-h");

const hasUnsavedChanges = computed(() =>
    whiteCards.value.length > 0 ||
    blackCards.value.length > 0 ||
    collectionName.value.trim() !== ""
);

// =====================================================
const blackCardTextParts = (blackCard: Card) => {
    const text = blackCard.text || "";

    return getTextParts(text);
};

const getTextParts = (text: string): TextPart[] => {
    if (!text.includes(GAP_TOKEN)) {
        return [{ text, isGap: false }];
    }

    const textParts = text.split(GAP_TOKEN);
    const parts: TextPart[] = [];
    let gapIndex = 0;

    textParts.forEach((part: string, index: number) => {
        parts.push({ text: part, isGap: false });

        if (index < textParts.length - 1) {
            parts.push({ text: "", isGap: true, gapIndex });
            gapIndex += 1;
        }
    });

    console.log("Parsed text parts:", parts);

    return parts;
};


function insertGap() {
    currentBlackCardText.value.push({ text: "", isGap: true, gapIndex: currentBlackCardText.value.filter((part: TextPart) => part.isGap).length });
}

function insertText() {
    currentBlackCardText.value.push({ text: "", isGap: false });
}

function deleteLast() {
    currentBlackCardText.value.pop();
}

// =====================================================

const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges.value) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    }
};

function leavePage() {
    if (hasUnsavedChanges.value && !confirm("You have unsaved changes. Are you sure you want to leave?")) {
        return;
    }
    navigateTo('/sets');
}

function editCard(card: Card, index: number, type: "white" | "black") {
    editIndex.value = index;
    editType.value = type;

    currentBlackCardText.value = blackCardTextParts(card);

    nextTick(() => {
        if (type === "white") {
            const input = Array.isArray(editInputWhite.value)
                ? editInputWhite.value[0]
                : editInputWhite.value;
            input?.focus();
        } else {
            const input = Array.isArray(editInputBlack.value)
                ? editInputBlack.value[0]
                : editInputBlack.value;
            input?.focus();
        }
    });
}

function saveEdit() {
    editIndex.value = null;
    editType.value = null;
    currentBlackCardText.value = [];
}

async function saveCollection() {
    if (collectionName.value.trim() === "") {
        alert("Collection name cannot be empty.");
        return;
    }

    const { data: collection, error: collectionError } = await supabase
        .from("collections")
        .insert({ name: collectionName.value, user_id: user.value?.sub })
        .select()
        .single();

    if (collectionError) {
        console.error("Error creating collection:", collectionError);
        alert("Failed to create collection. Please try again.");
        return;
    }

    const collectionId = collection.id;

    const whiteCardsToInsert = whiteCards.value.map((card) => ({
        text: card.text,
        type: "white",
        collection_id: collectionId,
    }));

    const blackCardsToInsert = blackCards.value.map((card) => ({
        text: card.text,
        type: "black",
        collection_id: collectionId,
    }));

    const { error: whiteCardsError } = await supabase
        .from("cards")
        .insert(whiteCardsToInsert);

    if (whiteCardsError) {
        console.error("Error inserting white cards:", whiteCardsError);
        alert("Failed to save white cards. Please try again.");
        return;
    }

    const { error: blackCardsError } = await supabase
        .from("cards")
        .insert(blackCardsToInsert);

    if (blackCardsError) {
        console.error("Error inserting black cards:", blackCardsError);
        alert("Failed to save black cards. Please try again.");
        return;
    }

    alert("Collection saved successfully!");
    navigateTo('/sets');
}

function deleteCard(index: number, type: "white" | "black") {
    if (confirm("Are you sure you want to delete this card? This action cannot be undone.")) {
        if (type === "white") {
            whiteCards.value.splice(index, 1);
        } else {
            blackCards.value.splice(index, 1);
        }
    }
}

function newWhiteCard() {
    whiteCards.value.push({
        text: "New white card",
        is_black: false,
        created_at: new Date().toISOString(),
    } as Card);
}

function newBlackCard() {
    blackCards.value.push({
        text: "New Black card",
        is_black: true,
        created_at: new Date().toISOString(),
    } as Card);
}


onMounted(async () => {
    window.addEventListener("beforeunload", beforeUnloadHandler);

    console.log("Current user:", user.value);
    const userId = user.value?.id ?? user.value?.sub;
});

onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
});
</script>