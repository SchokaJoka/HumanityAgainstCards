<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";

// VARIABLES
// ============================================================
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

const GAP_TOKEN: string = "[[W1tnYXBdXQ==]]";

type TextPart = {
    text: string;
    isGap: boolean;
    gapIndex?: number;
};

// ============================================================

// COMPOSABLES
// ============================================================
const { headerEl } = useHeaderHeight();
const {
    // Variables
    isLeaving,
    gameMasterId,

    // Functions
    getRoomIdByCode,
    getRoomMetadata,
    enterRoom,
    deletePlayerFromRoomTable,
    markMemberInactive,
    trackMyStatus,
    leaveRoomRealtime,
} = useRoom();

const {
    // Variables
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

    // Functions
    handleGameStateChanges,
} = useGameManager();

const { syncPlayerScoresForRoom } = usePlayerScores();
// ============================================================

const blackCardDraftParts = ref<TextPart[]>([{ text: "", isGap: false }]);
const blackCardDraftError = ref<string>("");

// COMPUTED PROPERTIES
// ============================================================
const czarId = computed(() => {
    if (!gameStarted.value) return null;
    return gameState.value?.czar_id ?? null;
});

const isCzar = computed(() => {
    return !!playerId.value && playerId.value === czarId.value;
});

const numberOfCardsToPlay = computed(() => {
    const card = blackCard.value as any;
    if (!card || card.number_of_gaps == null) return 1;
    if (card.number_of_gaps === 0) return 1;
    return card.number_of_gaps;
});

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

    return parts;
};

const blackCardTextParts = computed(() => {
    const text = blackCard.value?.text || "";
    return getTextParts(text);
});

const myPresenceStatus = computed(() => {
    if (!gameStarted.value || roundStatus.value === "lobby") {
        return "waiting";
    }

    if (roundStatus.value === "round_start") {
        if (isCzar.value) return "czar";
        return isWhiteCardsSubmitted.value ? "submitted" : "choosing";
    }

    if (roundStatus.value === "round_submitted") {
        return isCzar.value ? "judging" : "waiting";
    }

    if (roundStatus.value === "round_end") {
        if (winnerUserId.value && winnerUserId.value === playerId.value)
            return "winner";
        return "round end";
    }

    return "playing";
});

watch(myPresenceStatus, async () => {
    await trackMyStatus(myPresenceStatus.value);
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
    return playerSubmissions.value.map((submission: any) => {
        const texts = (submission.metadata?.submitted_cards ?? []) as string[];
        return {
            id: submission.user_id,
            card_id: `creative-${submission.user_id}`,
            submission,
            texts,
        };
    });
});

const judgingLookupCards = computed(() => {
    return judgingCarouselItems.value.map((item) => ({
        id: item.card_id,
        text: item.texts.join(" / "),
    }));
});

const selectedJudgingCardIds = computed(() => {
    if (!selectedPlayerSubmission.value?.user_id) return [];
    return [`creative-${selectedPlayerSubmission.value.user_id}`];
});
// ============================================================

const insertGap = () => {
    blackCardDraftParts.value.push({ text: "", isGap: true });
};

const insertText = () => {
    blackCardDraftParts.value.push({ text: "", isGap: false });
};

const deleteLast = () => {
    if (blackCardDraftParts.value.length > 1) {
        blackCardDraftParts.value.pop();
    }
};

const buildBlackCardText = () =>
    blackCardDraftParts.value
        .map((part) => (part.isGap ? GAP_TOKEN : part.text))
        .join("");

const blackCardGapCount = computed(() =>
    blackCardDraftParts.value.filter((part) => part.isGap).length,
);

async function submitBlackCard() {
    if (!isCzar.value || !roomId.value) return;

    const text = buildBlackCardText();
    if (!text.trim()) {
        blackCardDraftError.value = "Black card cannot be empty.";
        return;
    }

    blackCardDraftError.value = "";
    const cardPayload = {
        text,
        number_of_gaps: blackCardGapCount.value,
        is_black: true,
    };

    const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", roomId.value)
        .single();

    if (roomErr) {
        console.error("Error loading room metadata:", roomErr);
        return;
    }

    const playedBlack = (room?.metadata?.played_black_cards ?? []) as any[];
    const updatedMetadata = {
        ...(room?.metadata ?? {}),
        black_card: cardPayload,
        round_status: "round_start",
        played_black_cards: [...playedBlack, cardPayload],
    };

    const { error: updateErr } = await supabase
        .from("rooms")
        .update({ metadata: updatedMetadata })
        .eq("id", roomId.value);

    if (updateErr) {
        console.error("Error saving black card:", updateErr);
        return;
    }

    blackCard.value = cardPayload;
}

const canSubmitWhiteCards = computed(() => {
    if (!blackCard.value) return false;
    return myChosenWhiteCards.value.every((text) => text.trim().length > 0);
});

async function submitCards() {
    if (isCzar.value || !roomId.value || !playerId.value) return;
    if (!canSubmitWhiteCards.value) return;
    if (isSubmittingWhiteCards.value) return;

    isSubmittingWhiteCards.value = true;

    try {
        const submittedTexts = myChosenWhiteCards.value.map((text) => text.trim());

        const { data: memberRow, error: memberFetchError } = await supabase
            .from("room_members")
            .select("metadata")
            .eq("room_id", roomId.value)
            .eq("user_id", playerId.value)
            .single();

        if (memberFetchError) throw memberFetchError;

        const updatedMemberMetadata = {
            ...(memberRow?.metadata ?? {}),
            submitted_cards: submittedTexts,
        };

        const { error: memberUpdateError } = await supabase
            .from("room_members")
            .update({ metadata: updatedMemberMetadata, status: "submitted" })
            .eq("room_id", roomId.value)
            .eq("user_id", playerId.value);

        if (memberUpdateError) throw memberUpdateError;

        const { data: room, error: roomErr } = await supabase
            .from("rooms")
            .select("metadata")
            .eq("id", roomId.value)
            .single();

        if (!roomErr) {
            const playedWhite = (room?.metadata?.played_white_cards ?? []) as string[];
            await supabase
                .from("rooms")
                .update({
                    metadata: {
                        ...(room?.metadata ?? {}),
                        played_white_cards: [...playedWhite, ...submittedTexts],
                    },
                })
                .eq("id", roomId.value);
        }

        const czarIdFromRoom = room?.metadata?.czar_id ?? czarId.value;

        const { count: totalNonCzar, error: totalErr } = await supabase
            .from("room_members")
            .select("user_id", { count: "exact", head: true })
            .eq("room_id", roomId.value)
            .neq("user_id", czarIdFromRoom)
            .eq("is_active", true);

        if (totalErr) throw totalErr;

        const { count: submittedNonCzar, error: submittedErr } = await supabase
            .from("room_members")
            .select("user_id", { count: "exact", head: true })
            .eq("room_id", roomId.value)
            .neq("user_id", czarIdFromRoom)
            .eq("is_active", true)
            .eq("status", "submitted");

        if (submittedErr) throw submittedErr;

        const totalCount = Number(totalNonCzar ?? 0);
        const submittedCount = Number(submittedNonCzar ?? 0);

        if (totalCount > 0 && submittedCount === totalCount) {
            await supabase
                .from("rooms")
                .update({
                    metadata: {
                        ...(room?.metadata ?? {}),
                        round_status: "round_submitted",
                    },
                })
                .eq("id", roomId.value);
            gameChannel.value?.send({
                type: "broadcast",
                event: "round_submitted",
                payload: { roomId: roomId.value },
            });
        }

        isWhiteCardsSubmitted.value = true;
    } catch (error) {
        console.error("Error submitting white cards:", error);
    } finally {
        isSubmittingWhiteCards.value = false;
    }
}

// Czar Choose Winner Handling
// ============================================================
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

    const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", roomId.value)
        .single();

    if (roomErr || !room?.metadata) {
        console.error("Error loading room metadata:", roomErr);
        return;
    }

    const { data: members, error: membersErr } = await supabase
        .from("room_members")
        .select("user_id, metadata")
        .eq("room_id", roomId.value)
        .order("joined_at", { ascending: true });

    if (membersErr || !members?.length) {
        console.error("Error loading members:", membersErr);
        return;
    }

    const round = Number(room.metadata.round ?? 1);
    const nextCzarId = members[round % members.length].user_id;

    const resetPromises = members.map((member: any) =>
        supabase
            .from("room_members")
            .update({
                status: "waiting",
                metadata: {
                    ...(member.metadata ?? {}),
                    submitted_cards: [],
                },
            })
            .eq("room_id", roomId.value)
            .eq("user_id", member.user_id),
    );
    await Promise.all(resetPromises);

    await supabase
        .from("rooms")
        .update({
            metadata: {
                ...(room.metadata ?? {}),
                round: round + 1,
                czar_id: nextCzarId,
                black_card: null,
                round_status: "round_start",
                current_winner: null,
            },
        })
        .eq("id", roomId.value);

    isWhiteCardsSubmitted.value = false;
    myChosenWhiteCards.value = [];
    blackCardDraftParts.value = [{ text: "", isGap: false }];
    selectedPlayerSubmission.value = null;
}

async function saveSet() {
    if (!isGameMaster.value || !roomId.value) return;

    const name = prompt("Set name");
    if (!name || !name.trim()) return;

    const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", roomId.value)
        .single();

    if (roomErr) {
        console.error("Error loading room metadata:", roomErr);
        return;
    }

    const playedBlack = (room?.metadata?.played_black_cards ?? []) as any[];
    const playedWhite = (room?.metadata?.played_white_cards ?? []) as string[];

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

// ============================================================
// onMounted, onUnmounted
// ============================================================
const isNavigatingWithinRoom = ref(false);

onMounted(async () => {
    roomCode.value = String(route.params.roomCode ?? "").toUpperCase();

    roomId.value = await getRoomIdByCode(roomCode.value);

    if (!roomId.value) {
        console.error("Missing room ID");
        return;
    }

    gameManagerRoomId.value = roomId.value;

    const roomMetadata = await getRoomMetadata(roomId.value);

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

    const { data: room } = await supabase
        .from("rooms")
        .select("owner")
        .eq("id", roomId.value)
        .single();
    gameMasterId.value = room?.owner ?? null;

    await syncPlayerScoresForRoom(roomId.value);

    if (!gameChannel.value) {
        enterRoom(roomId.value, roomCode.value, playerId.value, "waiting");
    }

    const metadata = (roomMetadata?.metadata ?? null) as any;
    if (metadata) {
        await handleGameStateChanges(metadata);
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
// ============================================================

const roundStatusMessage = computed(() => {
    switch (roundStatus.value) {
        case "lobby":
            return "Waiting for players...";
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

const getWhiteCardTextAtGap = (gapIndex?: number) => {
    if (typeof gapIndex !== "number") return null;
    return myChosenWhiteCards.value[gapIndex] || null;
};
// ============================================================
</script>

<template>
    <main class="flex flex-col items-center w-full min-h-dvh">
        <header ref="headerEl" class="fixed pt-[env(safe-area-inset-top),0px)] w-full flex flex-col p-4 gap-2 z-40">
            <div class="w-full flex flex-row items-stretch justify-between gap-2">
                <div class="flex flex-row w-full items-center justify-start overflow-x-auto gap-2">
                    <div v-for="player in players" :key="player.user_id" class="flex flex-col items-center gap-1">
                        <div class="flex items-center justify-center size-12 rounded-full border-2 transition-all"
                            :class="czarId === player.user_id
                                ? 'border-yellow-300'
                                : player.status === 'submitted'
                                    ? 'border-green-300'
                                    : 'border-black'
                                ">
                            <img src="https://placehold.co/40" alt="Player avatar"
                                class="size-10 rounded-full object-cover" />
                        </div>
                        <span class="text-xs font-semibold transition">{{ player.user_id === playerId ? 'You' :
                            player.user_name
                            }}</span>
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

        <section name="game-section" v-if="gameStarted"
            class="w-full mt-[var(--sets-header-h)] h-[calc(100dvh-var(--sets-header-h))] flex items-center gap-4 overflow-y-visible py-4"
            :class="isCzar ? 'flex-col-reverse justify-start' : 'flex-col justify-start'">
            <TransitionGroup name="fade" mode="out-in">
                <div v-if="blackCard"
                    class="w-full max-h-[40dvh] max-w-[55dvw] min-w-[16rem] md:max-w-md h-96 rounded-xl bg-black p-6 pb-12 text-lg font-bold text-white">
                    <div>
                        <span v-for="(part, index) in blackCardTextParts" :key="`black-card-${index}`"
                            :class="part.isGap ? 'm-1 p-2 bg-white text-black rounded-md' : ''">
                            {{ part.isGap ? getWhiteCardTextAtGap(part.gapIndex) || "___" : part.text }}
                        </span>
                    </div>
                </div>

                <div v-if="isCzar && roundStatus === 'round_start' && !blackCard" class="w-full max-w-2xl">
                    <div class="w-full flex flex-col gap-2 bg-black p-5 rounded-lg border border-[3px] border-white">
                        <div v-for="(part, index) in blackCardDraftParts" :key="index"
                            class="w-full flex flex-row gap-4">
                            <span v-if="part.isGap" class="text-white">GAP</span>
                            <input v-else type="text" v-model="part.text"
                                class="flex-1 bg-white text-black px-2 py-1 rounded" />
                        </div>
                        <div class="w-full flex flex-row gap-2">
                            <Button v-if="!blackCardDraftParts[blackCardDraftParts.length - 1].isGap" @click="insertGap"
                                variant="primary" size="sm" block class="rounded-xl">Insert Gap</Button>
                            <Button v-if="blackCardDraftParts[blackCardDraftParts.length - 1].isGap" @click="insertText"
                                variant="primary" size="sm" block class="rounded-xl">Insert Text</Button>
                            <Button v-if="blackCardDraftParts.length > 1" @click="deleteLast" variant="primary"
                                size="sm" block class="rounded-xl">Delete</Button>
                        </div>
                        <p v-if="blackCardDraftError" class="text-red-200 text-sm">{{ blackCardDraftError }}</p>
                        <Button @click="submitBlackCard" variant="primary" size="md" class="rounded-xl">Submit Black
                            Card</Button>
                    </div>
                </div>

                <div v-if="!isCzar && roundStatus === 'round_start' && !isWhiteCardsSubmitted && blackCard"
                    class="w-full max-w-2xl flex flex-col gap-3">
                    <div v-for="(_, index) in numberOfCardsToPlay" :key="`white-input-${index}`" class="w-full">
                        <input v-model="myChosenWhiteCards[index]" type="text" placeholder="Write your white card..."
                            class="w-full bg-white border-2 border-black rounded-lg px-4 py-3 text-lg" />
                    </div>
                </div>

                <div v-if="roundStatus === 'round_submitted'" class="w-full h-full overflow-y-visible z-10">
                    <MyCarousel :items="judgingCarouselItems" :lookup-cards="judgingLookupCards"
                        :selected-ids="selectedJudgingCardIds" selected-class="selected-judging"
                        @select-item="pickWinner" />
                </div>

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

        <section name="action-buttons" v-if="gameStarted"
            class="fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] w-full flex flex-row items-center justify-center transition-all z-40">
            <transition name="fade" mode="out-in">
                <Button v-if="roundStatus === 'round_start' && !isCzar && !isWhiteCardsSubmitted" @click="submitCards"
                    :disabled="isSubmittingWhiteCards || !canSubmitWhiteCards" variant="primary" size="md"
                    class="rounded-xl" key="submit-cards">
                    {{ isSubmittingWhiteCards ? "Submitting..." : "Submit" }}
                </Button>
                <Button v-else-if="roundStatus === 'round_submitted' && isCzar"
                    @click="submitWinner(selectedPlayerSubmission)"
                    :disabled="isChoosingWinner || !selectedPlayerSubmission" variant="primary" size="md"
                    class="rounded-xl" key="choose-winner">
                    {{ isChoosingWinner ? "Choosing..." : "Choose" }}
                </Button>
                <Button v-else-if="roundStatus === 'round_end' && isCzar" @click="startNextRound"
                    :disabled="isStartingNextRound" variant="primary" size="md" class="rounded-xl" key="next-round">
                    {{ isStartingNextRound ? "Loading..." : "Next Round" }}
                </Button>
            </transition>
        </section>

        <section v-if="roundStatus === 'round_end' && isGameMaster"
            class="fixed bottom-[max(env(safe-area-inset-bottom),5rem)] w-full flex flex-row items-center justify-center z-40">
            <Button @click="saveSet" variant="tertiary" size="md" class="rounded-xl">Save Set</Button>
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
    @apply border-red-400 bg-red-50 ring-2 ring-red-200;
}
</style>
