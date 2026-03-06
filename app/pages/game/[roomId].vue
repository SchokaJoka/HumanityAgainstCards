<script setup>
import { useAppSupabaseClient } from '~/utils/supabase'
import { useCards } from '~/composables/useCards'

const supabase = useAppSupabaseClient()
const { getCardSets, getCardsFromSets } = useCards()

const route = useRoute()
const roomCode = String(route.params.roomId ?? '').toUpperCase()

// Game state
const players = ref([])
const authError = ref('')
const currentPlayerId = ref(null)
const currentRoomDbId = ref(null)
const isLeaving = ref(false)
const gameStarted = ref(false)
const currentCzarIndex = ref(null)

// CAH specific state
const hand = ref([])
const blackCard = ref(null)
const playedCards = ref([]) // Cards played by others this round
const myPlayedCard = ref(null)
const winner = ref(null)
const roundStatus = ref('LOBBY') // LOBBY, SELECTION, JUDGING, WINNER
const scores = ref({})

// First player in join order acts as game master.
const currentGameMasterUserId = computed(() => {
    const firstPlayer = players.value[0]
    return firstPlayer?.user_id ?? null
})

// True when this client is the current game master.
const isCurrentPlayerGameMaster = computed(() => {
    return !!currentPlayerId.value && currentPlayerId.value === currentGameMasterUserId.value
})

// User id of the active czar for the current round.
const currentCzarUserId = computed(() => {
    if (!gameStarted.value || currentCzarIndex.value === null || players.value.length === 0) {
        return null
    }
    const czar = players.value[currentCzarIndex.value % players.value.length]
    return czar?.user_id ?? null
})

// True when this client is the active czar.
const isCurrentPlayerCzar = computed(() => {
    return !!currentPlayerId.value && currentPlayerId.value === currentCzarUserId.value
})

let gameChannel

// ACTION - Start game
const startGame = async () => {
    if (!gameChannel || players.value.length < 2 || !isCurrentPlayerGameMaster.value) {
        if (players.value.length < 2) authError.value = 'Need at least 2 players to start.'
        return
    }

    // Fetch cards
    const sets = await getCardSets()
    console.log('Available sets:', sets)
    if (sets.length === 0) {
        authError.value = 'No card sets found in database.'
        return
    }

    const { blackCards, whiteCards } = await getCardsFromSets([sets[0].id])
    
    const initialBlackCard = blackCards[0]
    const remainingBlackCards = blackCards.slice(1)
    const remainingWhiteCards = whiteCards // We'll deal from here

    await recordMove({
        type: 'START_GAME',
        blackCard: initialBlackCard,
        czarIndex: 0,
        decks: {
            black: remainingBlackCards.map(c => c.id),
            white: remainingWhiteCards.map(c => c.id)
        }
    })
}

const recordMove = async (payload) => {
    if (!currentRoomDbId.value || !currentPlayerId.value) return

    // Get latest seq
    const { data: lastMove } = await supabase
        .from('game_moves')
        .select('seq')
        .eq('room_id', currentRoomDbId.value)
        .order('seq', { ascending: false })
        .limit(1)
        .single()
    
    const nextSeq = (lastMove?.seq ?? 0) + 1

    const { error } = await supabase
        .from('game_moves')
        .insert({
            room_id: currentRoomDbId.value,
            actor_id: currentPlayerId.value,
            payload,
            seq: nextSeq
        })

    if (error) console.error('Failed to record move:', error)
}

const playCard = async (card) => {
    if (isCurrentPlayerCzar.value || roundStatus.value !== 'SELECTION' || myPlayedCard.value) return

    myPlayedCard.value = card
    hand.value = hand.value.filter(c => c.id !== card.id)

    await recordMove({
        type: 'PLAY_CARD',
        card: card,
        playerId: currentPlayerId.value
    })
}

const selectWinner = async (playedCard) => {
    if (!isCurrentPlayerCzar.value || roundStatus.value !== 'JUDGING') return

    await recordMove({
        type: 'SELECT_WINNER',
        winnerCard: playedCard.card,
        winnerId: playedCard.playerId
    })
}

const nextRound = async () => {
    if (!isCurrentPlayerGameMaster.value || roundStatus.value !== 'WINNER') return

    // Draw next black card from metadata or db? 
    // For simplicity, let's just pick a random one or have the game master track the deck in room metadata
    const { data: room } = await supabase
        .from('rooms')
        .select('metadata')
        .eq('id', currentRoomDbId.value)
        .single()
    
    const metadata = room?.metadata || {}
    const blackDeck = metadata.blackDeck || []
    const whiteDeck = metadata.whiteDeck || []

    if (blackDeck.length === 0) {
        authError.value = "Out of cards!"
        return
    }

    const nextBlackCardId = blackDeck[0]
    const newBlackDeck = blackDeck.slice(1)

    // Fetch the actual card data
    const { data: nextBlackCard } = await supabase
        .from('cards')
        .select('*')
        .eq('id', nextBlackCardId)
        .single()

    await recordMove({
        type: 'NEXT_ROUND',
        blackCard: nextBlackCard,
        czarIndex: (currentCzarIndex.value + 1) % players.value.length,
        newBlackDeck
    })
}

const handleMove = async (move) => {
    const { type, payload } = move
    console.log('Processing move:', type, payload)

    if (type === 'START_GAME') {
        gameStarted.value = true
        blackCard.value = payload.blackCard
        currentCzarIndex.value = payload.czarIndex
        roundStatus.value = 'SELECTION'
        playedCards.value = []
        myPlayedCard.value = null
        winner.value = null
        
        // Update room metadata with decks (only Game Master usually does this, but here we just react)
        if (isCurrentPlayerGameMaster.value) {
            await supabase.from('rooms').update({
                metadata: {
                    blackDeck: payload.decks.black,
                    whiteDeck: payload.decks.white
                }
            }).eq('id', currentRoomDbId.value)
        }

        // Deal initial hand of 10 cards
        await dealInitialHand(payload.decks.white)
    } 
    else if (type === 'PLAY_CARD') {
        playedCards.value.push(payload)
        // Check if everyone (except Czar) has played
        const expectedPlays = players.value.length - 1
        if (playedCards.value.length >= expectedPlays) {
            roundStatus.value = 'JUDGING'
        }
    }
    else if (type === 'SELECT_WINNER') {
        winner.value = payload
        roundStatus.value = 'WINNER'
        scores.value[payload.winnerId] = (scores.value[payload.winnerId] || 0) + 1
    }
    else if (type === 'NEXT_ROUND') {
        blackCard.value = payload.blackCard
        currentCzarIndex.value = payload.czarIndex
        roundStatus.value = 'SELECTION'
        playedCards.value = []
        myPlayedCard.value = null
        winner.value = null

        if (isCurrentPlayerGameMaster.value) {
            await supabase.from('rooms').update({
                metadata: {
                    ... (await supabase.from('rooms').select('metadata').eq('id', currentRoomDbId.value).single()).data?.metadata,
                    blackDeck: payload.newBlackDeck
                }
            }).eq('id', currentRoomDbId.value)
        }

        // Refill hand to 10
        await refillHand()
    }
}

const dealInitialHand = async (whiteDeckIds) => {
    // Each player takes 10 cards based on their index in players list to avoid collisions if possible, 
    // but better to have a central dealer. For this "simple" version, let's just fetch 10 random cards for now 
    // or use the deck provided.
    const playerIdx = players.value.findIndex(p => p.user_id === currentPlayerId.value)
    const startIdx = playerIdx * 10
    const myCardIds = whiteDeckIds.slice(startIdx, startIdx + 10)

    const { data: myCards } = await supabase
        .from('cards')
        .select('*')
        .in('id', myCardIds)
    
    hand.value = myCards || []
}

const refillHand = async () => {
    if (hand.value.length >= 10) return

    const { data: room } = await supabase
        .from('rooms')
        .select('metadata')
        .eq('id', currentRoomDbId.value)
        .single()
    
    const whiteDeck = room?.metadata?.whiteDeck || []
    const needed = 10 - hand.value.length
    
    // This is tricky without a central lock. 
    // In a real app, we'd use a DB function to "pop" cards from the deck.
    // For now, let's just pick 'needed' cards from the end of the deck based on total moves or something.
    // Simpler: just fetch some random white cards that are not in hand.
    const { data: newCards } = await supabase
        .from('cards')
        .select('*')
        .eq('is_black', false)
        .limit(needed)
    
    hand.value = [...hand.value, ...(newCards || [])]
}

const leaveRoom = async () => {
    isLeaving.value = true
    await markMemberInactive()
    await navigateTo('/')
}

const markMemberInactive = async () => {
    if (!currentPlayerId.value || !currentRoomDbId.value) return
    await supabase
        .from('room_members')
        .update({ is_active: false, left_at: new Date().toISOString() })
        .eq('room_id', currentRoomDbId.value)
        .eq('user_id', currentPlayerId.value)
}

onMounted(async () => {
    authError.value = ''
    
    const { data: currentAuthData } = await supabase.auth.getUser()
    let currentUser = currentAuthData.user

    if (!currentUser) {
        const { data: anonymousAuthData, error: anonymousAuthError } = await supabase.auth.signInAnonymously()
        if (anonymousAuthError) {
            authError.value = 'Could not create guest session.'
            return
        }
        currentUser = anonymousAuthData.user
    }

    const playerId = currentUser.id
    currentPlayerId.value = playerId

    // Room Lookup
    const { data: existingRoom } = await supabase
        .from('rooms')
        .select('id, code')
        .eq('code', roomCode)
        .maybeSingle()

    if (!existingRoom) {
        authError.value = 'Room does not exist.'
        return
    }

    currentRoomDbId.value = existingRoom.id

    // Join Room
    await supabase.from('room_members').upsert({
        room_id: existingRoom.id,
        user_id: playerId,
        role: 'player',
        is_active: true,
        left_at: null
    }, { onConflict: 'room_id,user_id' })

    // Channel setup
    gameChannel = supabase.channel(`${roomCode}`, {
        config: { broadcast: { self: true }, presence: { key: playerId } }
    })

    gameChannel.on('presence', { event: 'sync' }, () => {
        const newState = gameChannel.presenceState()
        players.value = Object.keys(newState)
            .map(key => newState[key][0])
            .sort((a, b) => (a.joined_at ?? 0) - (b.joined_at ?? 0))
    })

    gameChannel.on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'game_moves', 
        filter: `room_id=eq.${existingRoom.id}` 
    }, (payload) => {
        handleMove(payload.new)
    })

    gameChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await gameChannel.track({
                user_id: playerId,
                status: 'playing',
                joined_at: Date.now()
            })
        }
    })

    // Load existing moves to catch up
    const { data: moves } = await supabase
        .from('game_moves')
        .select('*')
        .eq('room_id', existingRoom.id)
        .order('seq', { ascending: true })
    
    if (moves && moves.length > 0) {
        for (const move of moves) {
            await handleMove(move)
        }
    }
})

onUnmounted(() => {
    if (!isLeaving.value) markMemberInactive()
    if (gameChannel) supabase.removeChannel(gameChannel)
})
</script>

<template>
    <div class="mx-auto max-w-4xl p-4 sm:p-6">
        <!-- Lobby / Header -->
        <div class="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-xl font-bold text-gray-900">Room: {{ roomCode }}</h1>
                    <p class="text-sm text-gray-500">{{ players.length }} players online</p>
                </div>
                <div class="flex gap-2">
                    <button v-if="!gameStarted && isCurrentPlayerGameMaster" 
                        @click="startGame" 
                        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                        Start Game
                    </button>
                    <button @click="leaveRoom" class="text-sm font-medium text-gray-600 hover:text-gray-900">
                        Leave
                    </button>
                </div>
            </div>

            <!-- Player List -->
            <div class="mt-4 flex flex-wrap gap-2">
                <div v-for="player in players" :key="player.user_id" 
                    class="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium"
                    :class="currentCzarUserId === player.user_id ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50'">
                    <span>{{ player.user_id.slice(0, 5) }}</span>
                    <span v-if="currentCzarUserId === player.user_id" class="font-bold">CZAR</span>
                    <span class="text-gray-400">({{ scores[player.user_id] || 0 }})</span>
                </div>
            </div>
        </div>

        <div v-if="authError" class="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {{ authError }}
        </div>

        <!-- Game Area -->
        <div v-if="gameStarted" class="space-y-8">
            <!-- Black Card -->
            <div class="flex justify-center">
                <div v-if="blackCard" class="relative h-64 w-48 rounded-xl bg-gray-900 p-6 text-lg font-bold text-white shadow-xl">
                    <div v-html="blackCard.text.replace(/_/g, '<span class=\'border-b-2 border-white px-4 inline-block\'></span>')"></div>
                    <div class="absolute bottom-4 right-4 text-xs">STUW2</div>
                </div>
            </div>

            <!-- Status Message -->
            <div class="text-center">
                <p v-if="roundStatus === 'SELECTION'" class="text-lg font-medium">
                    {{ isCurrentPlayerCzar ? 'Waiting for players to pick...' : (myPlayedCard ? 'Waiting for others...' : 'Pick a white card!') }}
                </p>
                <p v-if="roundStatus === 'JUDGING'" class="text-lg font-medium text-indigo-600">
                    {{ isCurrentPlayerCzar ? 'Pick the winner!' : 'The Czar is judging...' }}
                </p>
                <div v-if="roundStatus === 'WINNER'" class="space-y-2">
                    <p class="text-xl font-bold text-emerald-600">Winner found!</p>
                    <button v-if="isCurrentPlayerGameMaster" @click="nextRound" class="rounded-lg bg-gray-900 px-6 py-2 text-white font-semibold">
                        Next Round
                    </button>
                </div>
            </div>

            <!-- Judging Area (Czar sees these) -->
            <div v-if="roundStatus === 'JUDGING' || roundStatus === 'WINNER'" class="flex flex-wrap justify-center gap-4">
                <div v-for="(play, idx) in playedCards" :key="idx" 
                    @click="selectWinner(play)"
                    class="h-64 w-48 cursor-pointer rounded-xl border-2 p-4 font-bold shadow-md transition-all hover:-translate-y-2"
                    :class="winner?.winnerId === play.playerId ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-indigo-400'">
                    {{ play.card.text }}
                </div>
            </div>

            <!-- Player Hand -->
            <div v-if="!isCurrentPlayerCzar" class="mt-12">
                <h3 class="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-gray-500">Your Hand</h3>
                <div class="flex flex-wrap justify-center gap-3">
                    <div v-for="card in hand" :key="card.id" 
                        @click="playCard(card)"
                        class="h-48 w-36 cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-sm font-bold shadow-sm transition-all hover:-translate-y-2 hover:border-indigo-400 hover:shadow-md"
                        :class="myPlayedCard?.id === card.id ? 'opacity-50 grayscale' : ''">
                        {{ card.text }}
                    </div>
                </div>
            </div>
        </div>

        <!-- Waiting for game to start -->
        <div v-else class="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200">
            <p class="text-gray-500">Wait for the Game Master to start...</p>
        </div>
    </div>
</template>