<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";
import myCarouselJudging from "~/components/myCarouselJudging.vue";
import LeaveConfirmOverlay from '~/components/LeaveConfirmOverlay.vue';

const user = useSupabaseUser();
const supabase = useSupabaseClient();

const route = useRoute();
const roomId = useState<string | null>("roomId", () => null);
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

const savedCollectionId = ref<string | null>(null);

const gameStarted = useState<boolean>("gameStarted", () => false);
const GAP_TOKEN = "[[W1tnYXBdXQ==]]";

type TextPart = {
    text: string;
    isGap: boolean;
    gapIndex?: number;
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
    leaveRoomRealtime,
    setRoomRoundStatus,
    collectionCards,
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

const { playerScores, getPlayerScore, updatePlayerScoreFromMember, syncPlayerScoresForRoom } = usePlayerScores();

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
    if (!text.includes(GAP_TOKEN)) return [{ text, isGap: false }];
    const textParts = text.split(GAP_TOKEN);
    const parts: TextPart[] = [];
    let gapIndex = 0;
    textParts.forEach((part, index) => {
        parts.push({ text: part, isGap: false });
        if (index < textParts.length - 1) {
            parts.push({ text: "", isGap: true, gapIndex });
            gapIndex += 1;
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

const sortedPlayersByScore = computed(() => {
    return [...players.value].sort((a: any, b: any) => {
        const scoreA = playerScores.value[a.user_id] ?? 0;
        const scoreB = playerScores.value[b.user_id] ?? 0;
        return scoreB - scoreA;
    });
});

const displayedPlayers = computed(() => {
    const sorted = sortedPlayersByScore.value;
    if (sorted.length <= 3) return sorted;
    const first2 = sorted.slice(0, 2);
    const last = sorted.slice(-1);
    return [...first2, ...last];
});

const winnerPlayer = computed(() => {
    return players.value.find((p: any) => p.user_id === winnerUserId.value);
});

const getWinnerTextAtGap = (gapIndex?: number) => {
    if (typeof gapIndex !== "number") return null;
    return (winnerCards.value && winnerCards.value[gapIndex]) ?? null;
};

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

const handleCreativeInputFocus = () => {
    // intentionally empty — provided for carousel input focus events
};

const handleCreativeInputBlur = () => {
    // intentionally empty — provided for carousel input blur events
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
    } else {
        // Save the created collection id into room metadata so future submissions are auto-appended
        const { error: roomUpdateErr } = await supabase
            .from("rooms")
            .update({
                metadata: {
                    ...(metadata ?? {}),
                    saved_collection_id: collectionId,
                },
            })
            .eq("id", roomId.value);
        if (roomUpdateErr) {
            console.error("Error updating room metadata with saved collection:", roomUpdateErr);
        } else {
            savedCollectionId.value = collectionId;
        }
    }
}

const isNavigatingWithinRoom = ref(false);
const showLeaveConfirm = ref(false);

async function handleLeaveConfirmed() {
    showLeaveConfirm.value = false;
    await deletePlayerFromRoomTable(roomId.value, playerId.value);
    navigateTo('/');
}

async function handleBackToLobbyConfirmed() {
    showLeaveConfirm.value = false;
    if (!roomId.value) return;
    try {
        const { data, error } = await supabase.functions.invoke("end_game_go_back_to_lobby", {
            method: "POST",
            body: { room_id: roomId.value },
        });
        if (error) console.error("[EDGE] end_game_go_back_to_lobby error:", error);
        else console.log("[EDGE] end_game_go_back_to_lobby", data);
    } catch (err) {
        console.error("Error invoking end_game_go_back_to_lobby:", err);
    }

    navigateTo(`/play/${roomCode.value}/lobby`);
}

async function handleSaveSetConfirmed() {
    showLeaveConfirm.value = false;
    await saveSet();
}

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
                savedCollectionId.value = initialMetadata?.saved_collection_id ?? null;
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

    blackCard.value = null;
    playerSubmissions.value = [];
    winnerUserId.value = null;
    winnerUsername.value = "";
    winnerCards.value = [];
    myChosenWhiteCards.value = [];
    selectedPlayerSubmission.value = null;
    isWhiteCardsSubmitted.value = false;
    isChoosingWinner.value = false;

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
        <header ref="headerEl"
            class="fixed pt-[env(safe-area-inset-top),0px)] w-full flex flex-col p-4 gap-2 z-40 bg-white">
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
                <LeaveConfirmOverlay :show="showLeaveConfirm" :is-game-master="isGameMaster" :round-status="roundStatus"
                    :saved-collection-id="savedCollectionId" @close="showLeaveConfirm = false"
                    @leave="handleLeaveConfirmed" @back-to-lobby="handleBackToLobbyConfirmed"
                    @save-set="handleSaveSetConfirmed" />
                <Button @click="showLeaveConfirm = true" variant="primary" size="md" class="rounded-xl">Leave</Button>
            </div>
            <div class="w-full flex flex-row gap-2">
                <div class="w-full text-center font-medium text-md">
                    {{ roundStatusMessage }}
                </div>
            </div>
        </header>

        <!-- Game Section -->
        <section name="game-section" v-if="gameStarted"
            class="w-full mt-[var(--sets-header-h)] h-[calc(100dvh-var(--sets-header-h))] flex items-center gap-2 overflow-y-visible pb-4"
            :class="isCzar
                ? roundStatus === 'round_create_black_card'
                    ? 'flex-col justify-start'
                    : 'flex-col-reverse justify-end'
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
                <div v-if="roundStatus === 'round_submitted'" class="w-full h-full overflow-y-clip">
                    <MyCarouselJudging :items="judgingCarouselItems" :lookup-cards="judgingLookupCards"
                        :selected-ids="selectedJudgingCardIds" selected-class="selected-judging"
                        @select-item="pickWinner" />
                </div>

                <!-- Round End Section (matches classic UI) -->
                <section name="round-end" v-if="gameStarted && roundStatus === 'round_end'"
                    class="w-full mt-[var(--sets-header-h)] h-[calc(100dvh-var(--sets-header-h))] flex flex-col justify-start items-center gap-4 p-4">

                    <!-- Winner Submission -->
                    <div class="w-full flex flex-row justify-around items-stretch gap-2 max-w-2xl">
                        <!-- Black Card -->
                        <div v-if="blackCard"
                            class="bg-black h-64 w-full rounded-xl p-4 font-bold border-2 border-black z-10">
                            <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
                                :class="part.isGap ? 'text-violet-500' : 'text-white'">
                                {{ part.isGap ? getWinnerTextAtGap(part.gapIndex) || '________'
                                    : part.text }}
                            </span>
                        </div>
                        <!-- Winner White Cards -->
                        <div class="w-full min-h-full flex flex-col">
                            <div v-for="(cardText, index) in winnerCards"
                                class="bg-white p-4 pr-8 shadow-xl h-full relative rounded-t-xl border-black border-x-2 border-t-2"
                                :class="[
                                    index === winnerCards.length - 1 ? 'rounded-b-xl border-b-2' : '',
                                    index === 0 ? 'pb-8' : '-mt-6 pb-16'
                                ]">
                                <span class="text-black font-bold">
                                    {{ cardText }}
                                </span>
                                <div
                                    class="absolute top-2 right-2 size-8 p-[0.1rem] flex items-center justify-center bg-white rounded-full text-xs font-bold">
                                    <div
                                        class="bg-black size-full rounded-full flex items-center justify-center text-white font-bold">
                                        {{ index + 1 || 'error' }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Player Scores -->
                    <div class="w-full h-full flex flex-col max-w-2xl gap-4 p-4 overflow-y-auto">
                        <TransitionGroup name="fade">
                            <div v-for="(player, index) in displayedPlayers" :key="player.user_id" :class="[
                                'w-full flex flex-row justify-between items-stretch border-[3px] ',
                                index === displayedPlayers.length - 1 ? 'bg-black text-white border-white' : 'bg-white text-black border-black'
                            ]">
                                <div class="w-full flex flex-row items-center">
                                    <div class="text-2xl flex items-center h-full px-4"
                                        :class="index === displayedPlayers.length - 1 ? 'bg-white text-black' : 'bg-black text-white'">
                                        {{ index === displayedPlayers.length - 1 ? 'Last' : index + 1 + '.' }}
                                    </div>
                                    <div class="flex flex-row w-full py-2 px-4 items-center justify-between">
                                        <div class="flex flex-row items-center gap-2">
                                            <div class="border-2 rounded-full flex items-center justify-center text-white font-bold mb-1 size-12"
                                                :class="index === displayedPlayers.length - 1 ? 'border-white' : 'border-black'">
                                                <img class="rounded-full size-10" src="https://placehold.co/50x50" />
                                            </div>
                                            <div class="">{{ player.user_name }}</div>
                                        </div>
                                        <div
                                            class="bg-black rounded-full flex items-center justify-center text-white font-bold mb-1 size-10">
                                            <span>{{ getPlayerScore(player.user_id) }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TransitionGroup>
                    </div>
                </section>

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
                <Button v-if="roundStatus === 'round_end' && isGameMaster && !savedCollectionId" @click="saveSet"
                    variant="tertiary" size="md" class="rounded-xl">
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
