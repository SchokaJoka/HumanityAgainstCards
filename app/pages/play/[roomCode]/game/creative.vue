<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";
import myCarouselJudging from "~/components/myCarouselJudging.vue";

const user = useSupabaseUser();
const supabase = useSupabaseClient();

const route = useRoute();
const roomId = ref<string>("");
const playerId = ref<string>("");
const roomCode = ref<string>("");

const players = useState<any[]>("players", () => []);
const gameChannel = useState<RealtimeChannel | null>("gameChannel", () => null);
const isGameMaster = useState<boolean>("isGameMaster", () => false);

const myChosenWhiteCards = useState<string[]>("myChosenWhiteCards", () => []);
const selectedPlayerSubmission = ref<any | null>(null);
const isWhiteCardsSubmitted = useState<boolean>("isWhiteCardsSubmitted", () => false);
const isSubmittingWhiteCards = ref<boolean>(false);
const isChoosingWinner = ref<boolean>(false);

const gameStarted = useState<boolean>("gameStarted", () => false);
const GAP_TOKEN = "[[W1tnYXBdXQ==]]";

type TextPart = {
    text: string;
    isGap: boolean;
};

const { headerEl } = useHeaderHeight();
const {
    isLeaving,
    gameMasterId,
    getRoomIdByCode,
    getRoomMetadata,
    enterRoom,
    deletePlayerFromRoomTable,
    markMemberInactive,
    trackMyStatus,
    leaveRoomRealtime,
} = useRoom();

const {
    isStartingNextRound,
    gameState,
    roundStatus,
    blackCard,
    playerSubmissions,
    winnerUserId,
    winnerUsername,
    winnerCards,
    gameManagerRoomId,
    gameManagerPlayerId,
    initializeNextRound,
    handleGameStateChanges,
} = useGameManager();

const { syncPlayerScoresForRoom } = usePlayerScores();

const isSubmittingBlackCard = ref<boolean>(false);

const czarId = computed(() => {
    if (!gameStarted.value) return null;
    return gameState.value?.czar_id ?? null;
});

const isCzar = computed(() => !!playerId.value && playerId.value === czarId.value);

const numberOfCardsToPlay = computed(() => {
    const rawCount = Number((blackCard.value as any)?.number_of_gaps ?? 1);
    if (!Number.isFinite(rawCount)) return 1;
    return Math.max(1, Math.trunc(rawCount));
});

const getTextParts = (text: string): TextPart[] => {
    if (!text.includes(GAP_TOKEN)) {
        return [{ text, isGap: false }];
    }

    const textParts = text.split(GAP_TOKEN);
    const parts: TextPart[] = [];

    textParts.forEach((part, index) => {
        parts.push({ text: part, isGap: false });
        if (index < textParts.length - 1) {
            parts.push({ text: "", isGap: true });
        }
    });

    return parts;
};

const blackCardTextParts = computed(() => getTextParts(blackCard.value?.text || ""));

watch([playerId, gameMasterId], ([nextPlayerId, nextGameMasterId]) => {
    isGameMaster.value = !!nextPlayerId && nextGameMasterId === nextPlayerId;
});

watch(
    numberOfCardsToPlay,
    (count) => {
        const nextCount = Number(count ?? 1);
        const next: string[] = [];
        for (let i = 0; i < nextCount; i += 1) {
            next.push(myChosenWhiteCards.value[i] ?? "");
        }
        myChosenWhiteCards.value = next;
    },
    { immediate: true },
);

const judgingCarouselItems = computed(() => {
    return playerSubmissions.value.flatMap((submission: any) => {
        const texts = (submission.metadata?.submitted_cards ?? []) as string[];
        return texts.map((text, index) => ({
            id: `${submission.user_id}-${index}`,
            card_id: `creative-${submission.user_id}-${index}`,
            submission,
            text,
        }));
    });
});

const judgingLookupCards = computed(() => {
    return judgingCarouselItems.value.map((item) => ({
        id: item.card_id,
        text: item.text,
    }));
});

const selectedJudgingCardIds = computed(() => {
    if (!selectedPlayerSubmission.value?.user_id) return [];
    const selectedId = String(selectedPlayerSubmission.value.user_id);
    return judgingCarouselItems.value.filter((item) => String(item.submission.user_id) === selectedId).map((item) => item.id);
});

const filledCardsCount = computed(() => {
    return myChosenWhiteCards.value.filter((card: string) => card.trim().length > 0).length;
});

const creativeCarouselItems = computed(() => {
    const count = numberOfCardsToPlay.value;
    return Array.from({ length: count }, (_, index) => ({
        id: `creative-card-${index}`,
        text: myChosenWhiteCards.value[index] ?? "",
    }));
});

const updateCreativeCardText = (payload: { index: number; text: string }) => {
    if (!Number.isFinite(payload.index) || payload.index < 0) return;

    const next = [...myChosenWhiteCards.value];
    while (next.length < numberOfCardsToPlay.value) {
        next.push("");
    }

    next[payload.index] = payload.text;
    myChosenWhiteCards.value = next;
};

async function submitBlackCard(text: string, number_of_gaps: number) {
    if (!isCzar.value || !roomId.value || isSubmittingBlackCard.value) return;

    if (!text.trim()) return;
    const cardPayload = {
        text,
        number_of_gaps: number_of_gaps,
        is_black: true,
    };
    isSubmittingBlackCard.value = true;
    try {
        const { data, error } = await supabase.functions.invoke("submit_black_card", {
            method: "POST",
            body: {
                room_id: roomId.value,
                czar_id: playerId.value,
                card: cardPayload,
            },
        });

        if (error) {
            console.error("Error saving black card:", error);
            return;
        }

        console.log("[EDGE] success submit_black_card", data);
        blackCard.value = data?.card ?? cardPayload;
    } finally {
        isSubmittingBlackCard.value = false;
    }
}

const canSubmitWhiteCards = computed(() => {
    if (!blackCard.value) return false;

    const requiredCount = numberOfCardsToPlay.value;
    if (myChosenWhiteCards.value.length < requiredCount) return false;

    for (let i = 0; i < requiredCount; i += 1) {
        const value = myChosenWhiteCards.value[i];
        if (typeof value !== "string" || value.trim().length === 0) {
            return false;
        }
    }

    return true;
});

async function submitCards() {
    if (isSubmittingWhiteCards.value) return;
    isSubmittingWhiteCards.value = true;

    try {
        const { data, error } = await supabase.functions.invoke("submit_white_cards", {
            method: "POST",
            body: {
                czar_id: czarId.value,
                user_id: playerId.value,
                room_id: roomId.value,
                submitted_cards: myChosenWhiteCards.value.map((text) => text.trim()),
            },
        });

        if (error) {
            console.error("[EDGE] Error submitting white cards:", error);
        } else {
            isWhiteCardsSubmitted.value = true;
            console.log("[EDGE] success submit_white_cards", data);
        }
    } finally {
        isSubmittingWhiteCards.value = false;
    }
}

async function pickWinner(item: any) {
    if (!isCzar.value) return;
    selectedPlayerSubmission.value = item.submission;
}

async function submitWinner(winnerSubmission: any) {
    if (!isCzar.value) return;

    const { data, error } = await supabase.functions.invoke("select_winner", {
        method: "POST",
        body: {
            room_id: roomId.value,
            winner: winnerSubmission,
        },
    });

    if (error) {
        console.error("Error selecting winner:", error);
    } else {
        console.log("[EDGE] success select_winner", data);
    }
}

async function startNextRound() {
    if (!isCzar.value || !roomId.value) return;
    if (isStartingNextRound.value) return;

    await initializeNextRound(roomId.value);

    isWhiteCardsSubmitted.value = false;
    myChosenWhiteCards.value = [];
    selectedPlayerSubmission.value = null;
}

async function saveSet() {
    if (!isGameMaster.value || !roomId.value) return;

    const name = prompt("Set name");
    if (!name || !name.trim()) return;

    const { data: room, error: roomErr } = await supabase.from("rooms").select("metadata").eq("id", roomId.value).single();

    if (roomErr) {
        console.error("Error loading room metadata:", roomErr);
        return;
    }

    const metadata = (room?.metadata ?? {}) as Record<string, any>;
    const playedBlack = (metadata.played_black_cards ?? []) as any[];
    const playedWhite = (metadata.played_white_cards ?? []) as string[];

    const { data: collection, error: collectionErr } = await supabase
        .from("collections")
        .insert({
            name: name.trim(),
            user_id: user.value?.id || user.value?.sub,
        })
        .select("id")
        .single();

    if (collectionErr || !collection?.id) {
        console.error("Error creating collection:", collectionErr);
        return;
    }

    const collectionId = collection.id;
    const cardsToInsert = [
        ...playedWhite.map((text) => ({
            text,
            is_black: false,
            collection_id: collectionId,
        })),
        ...playedBlack.map((card) => ({
            text: card.text,
            is_black: true,
            number_of_gaps: Number(card.number_of_gaps ?? 0),
            collection_id: collectionId,
        })),
    ];

    const { error: cardsErr } = await supabase.from("cards").insert(cardsToInsert);
    if (cardsErr) {
        console.error("Error saving cards:", cardsErr);
    }
}

const isNavigatingWithinRoom = ref(false);

onMounted(async () => {
    roomCode.value = String(route.params.roomCode ?? "").toUpperCase();

    roomId.value = await getRoomIdByCode(roomCode.value);

    if (!roomId.value) {
        console.error("Missing room ID");
        return;
    }

    gameManagerRoomId.value = roomId.value;

    if (user.value) {
        playerId.value = user.value.sub;
    } else {
        navigateTo("/login?redirect=joinGame&roomCode=" + roomCode.value);
        return;
    }

    if (!playerId.value) {
        console.error("Missing player ID");
        return;
    }

    gameManagerPlayerId.value = playerId.value;

    const { data: room } = await supabase.from("rooms").select("owner").eq("id", roomId.value).single();
    gameMasterId.value = room?.owner ?? "";

    await syncPlayerScoresForRoom(roomId.value);

    if (!gameChannel.value) {
        await enterRoom(roomId.value, roomCode.value, playerId.value, "waiting");
        try {
            const roomMetadata = await getRoomMetadata(roomId.value);
            const initialMetadata = (roomMetadata?.metadata ?? null) as any;
            if (initialMetadata) {
                await syncPlayerScoresForRoom(roomId.value);
                await handleGameStateChanges(initialMetadata);
            }
        } catch (error) {
            console.error("Error loading initial room metadata:", error);
        }
    }
});

onBeforeRouteLeave((to) => {
    if (to.params.roomCode === route.params.roomCode) {
        isNavigatingWithinRoom.value = true;
    }
});

onUnmounted(async () => {
    if (!isLeaving.value && roomId.value && playerId.value) {
        await markMemberInactive(roomId.value, playerId.value);
    }

    if (!isNavigatingWithinRoom.value) {
        await leaveRoomRealtime();
    }
});

const roundStatusMessage = computed(() => {
    switch (roundStatus.value) {
        case "lobby":
            return "Waiting for players...";
        case "round_create_black_card":
            return isCzar.value ? "Create the black card!" : "Waiting for Czar to create the black card...";
        case "round_start":
            return isCzar.value
                ? blackCard.value
                    ? "Wait for players to submit..."
                    : "Create the black card!"
                : "Write your white card(s)!";
        case "round_submitted":
            return isCzar.value ? "Pick the winner!" : "Waiting for Czar...";
        case "round_end":
            return winnerUsername.value
                ? `${winnerUsername.value.toUpperCase()} won the round!`
                : "Round ended. Waiting for next round...";
        default:
            return "";
    }
});
</script>

<template>
    <main class="flex flex-col items-center w-full min-h-dvh">
        <!-- Header -->
        <header ref="headerEl" class="fixed pt-[env(safe-area-inset-top),0px)] w-full flex flex-col p-4 gap-2 z-40">
            <div class="w-full flex flex-row items-stretch justify-between gap-2">
                <div class="flex flex-row w-full items-center justify-start overflow-x-auto gap-2">
                    <div v-for="player in players" :key="player.user_id" class="flex flex-col items-center gap-1">
                        <div class="flex items-center justify-center size-12 rounded-full border-2 transition-all"
                            :class="czarId === player.user_id ? 'border-yellow-300' : player.status === 'submitted' ? 'border-green-300' : 'border-black'">
                            <img src="https://placehold.co/40" alt="Player avatar"
                                class="size-10 rounded-full object-cover" />
                        </div>
                        <span class="text-xs font-semibold transition">{{ player.user_id === playerId ? 'You' :
                            player.user_name }}</span>
                    </div>
                </div>
                <Button @click="deletePlayerFromRoomTable(roomId, playerId)" variant="primary" size="md"
                    class="rounded-xl">
                    Leave
                </Button>
            </div>
            <div class="w-full flex flex-row gap-2">
                <div class="w-full text-center font-medium text-md">
                    {{ roundStatusMessage }}
                </div>
            </div>
        </header>

        <!-- Game Section -->
        <section name="game-section" v-if="gameStarted"
            class="w-full mt-[var(--sets-header-h)] h-[calc(100dvh-var(--sets-header-h))] flex items-center gap-4 overflow-y-visible py-4"
            :class="isCzar
                ? roundStatus === 'round_create_black_card'
                    ? 'flex-col justify-start'
                    : 'flex-col-reverse justify-start'
                : 'flex-col justify-start'">
            <TransitionGroup name="fade">

                <!-- Black Card -->
                <div v-if="blackCard" class="rounded-xl bg-black text-normal font-bold text-white">
                    <div class="w-52 h-64 overflow-y-scroll overflow-x-visible p-4">
                        <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
                            :class="part.isGap ? 'm-1 px-2 py-1 bg-white text-black rounded-md cursor-pointer' : ''">
                            {{ part.isGap ? `___` : part.text }}
                        </span>
                    </div>
                </div>

                <!-- Black Card Editor -->
                <div v-if="isCzar && roundStatus === 'round_create_black_card' && !blackCard"
                    class="w-full h-full max-h-[40dvh] max-w-md px-2">
                    <CreativeEditorBlackCard @submit="(data: any) => submitBlackCard(data.text, data.number_of_gaps)" />

                </div>

                <!-- White Card Input -->
                <div v-if="!isCzar && roundStatus === 'round_start' && !isWhiteCardsSubmitted && blackCard"
                    class="w-full max-w-2xl flex flex-col gap-3">
                    <MyCreativeCarousel :items="creativeCarouselItems" @update-item-text="updateCreativeCardText"
                        @focus-input="handleCreativeInputFocus" @blur-input="handleCreativeInputBlur" />
                </div>

                <!-- Czar Judging Carousel -->
                <div v-if="roundStatus === 'round_submitted'" class="w-full h-full overflow-y-visible">
                    <MyCarouselJudging :items="judgingCarouselItems" :lookup-cards="judgingLookupCards"
                        :selected-ids="selectedJudgingCardIds" selected-class="selected-judging"
                        @select-item="pickWinner" />
                </div>

                <!-- Winner Announcement -->
                <div v-if="roundStatus === 'round_end'" class="w-full p-4">
                    <div
                        class="flex flex-row items-center justify-start gap-4 bg-gray-100 p-4 rounded-lg transition-all">
                        <div v-for="(text, index) in winnerCards" :key="index"
                            class="relative w-full min-h-48 max-w-36 rounded-lg shadow-lg bg-white p-3 font-medium text-sm transition-all">
                            {{ text }}
                            <div class="absolute bottom-2 right-3 text-xs text-red-500">
                                {{ winnerUsername }}
                            </div>
                            <div class="absolute bottom-2 left-3 text-xs text-gray-400">
                                {{ index + 1 }}
                            </div>
                        </div>
                    </div>
                </div>
            </TransitionGroup>
        </section>

        <!-- Action Buttons -->
        <section name="action-buttons" v-if="gameStarted"
            class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] w-full flex flex-row items-center justify-center transition-all z-40">
            <TransitionGroup name="fade">
                <Button v-if="roundStatus === 'round_start' && !isCzar && !isWhiteCardsSubmitted" @click="submitCards"
                    :disabled="isSubmittingWhiteCards || !canSubmitWhiteCards" variant="primary" size="md"
                    class="rounded-xl" key="submit-cards">
                    {{
                        isSubmittingWhiteCards
                            ? 'Submitting...'
                            : filledCardsCount !== numberOfCardsToPlay
                                ? `${filledCardsCount} / ${numberOfCardsToPlay} Cards `
                                : 'Submit Cards' }}
                </Button>
                <Button v-else-if="roundStatus === 'round_submitted' && isCzar"
                    @click="submitWinner(selectedPlayerSubmission)"
                    :disabled="isChoosingWinner || !selectedPlayerSubmission" variant="primary" size="md"
                    class="rounded-xl" key="choose-winner">
                    {{ isChoosingWinner ? 'Choosing...' : 'Choose' }}
                </Button>
                <Button v-else-if="roundStatus === 'round_end' && isCzar" @click="startNextRound"
                    :disabled="isStartingNextRound" variant="primary" size="md" class="rounded-xl" key="next-round">
                    {{ isStartingNextRound ? 'Loading...' : 'Next Round' }}
                </Button>
                <Button v-if="roundStatus === 'round_end' && isGameMaster" @click="saveSet" variant="tertiary" size="md"
                    class="rounded-xl">
                    Save Set
                </Button>
            </TransitionGroup>
        </section>
    </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 300ms ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

:deep(.card.selected-judging) {
    border-color: rgb(248 113 113);
    background-color: rgb(254 242 242);
    box-shadow: 0 0 0 2px rgb(254 202 202);
}
</style>
