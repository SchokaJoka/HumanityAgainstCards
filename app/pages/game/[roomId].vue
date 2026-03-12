<script setup lang="ts">
import { useCards } from '~/composables/useCards'
import type { RealtimeChannel } from "@supabase/supabase-js";

const supabase = useSupabaseClient()
const { getCardSets, getCardsFromSets } = useCards()

const route = useRoute()
const roomCode = String(route.params.roomId ?? '').toUpperCase()
const roomId = ref<string | null>(null)

let gameChannel = ref<RealtimeChannel | null>(null)

// Game state
const players = ref([])
const authError = ref('')
const playerId = ref<string | null>(null)
const isLeaving = ref(false)
const gameStarted = ref(false)
const currentCzarIndex = ref(null)
const playerHandCards = ref([])

// CAH specific state
const hand = ref([])
const collectionCards = ref<any>({})
const blackCard = ref(null)
const playedCards = ref([]) // Cards played by others this round
const myPlayedCard = ref(null)
const winner = ref(null)
const roundStatus = ref('LOBBY') // LOBBY, SELECTION, JUDGING, WINNER
const scores = ref({})

// First player in join order acts as game master.
const gameMasterId = computed(() => {
    const firstPlayer = players.value[0]
    return firstPlayer?.user_id ?? null
})

// True when this client is the current game master.
const isGameMaster = computed(() => {
    return !!playerId.value && playerId.value === gameMasterId.value
})

// User id of the active czar for the current round.
const czarId = computed(() => {
    if (!gameStarted.value || currentCzarIndex.value === null || players.value.length === 0) {
        return null
    }
    const czar = players.value[currentCzarIndex.value % players.value.length]
    return czar?.user_id ?? null
})

// True when this client is the active czar.
const isCzar = computed(() => {
    return !!playerId.value && playerId.value === czarId.value
})

onMounted(async () => {
   
    /* 
    Authentication
    */

    let currentUser
    const { data: AuthData } = await supabase.auth.getUser()

    if (!AuthData.user) {
        console.log('No user session, creating anonymous user...')

        const { data: anonymousAuthData, error: anonymousAuthError } = await supabase.auth.signInAnonymously()
        
        if (anonymousAuthError) {
            authError.value = 'Could not create guest session!'
            return
        }

        currentUser = anonymousAuthData.user
    } else {
        currentUser = AuthData.user
        console.log('Existing user session found:', currentUser)
    }

    if (!currentUser) {
        authError.value = 'Failed to authenticate user.'
        return
    }

    playerId.value = currentUser.id

    /*
    Join Room
    */

    // Look up the room by code and get its ID
    const { data: existingRoom } = await supabase
        .from('rooms')
        .select('id, code')
        .eq('code', roomCode)
        .maybeSingle()

    if (!existingRoom) {
        authError.value = 'Room does not exist.'
        return
    }

    roomId.value = existingRoom.id

    // Add player to room_members table (or mark active if rejoining)
    const {data, error} = await supabase.from('room_members').upsert({
        room_id: roomId.value,
        user_id: playerId.value,
        role: 'player',
        is_active: true,
    }, { onConflict: 'room_id,user_id' })

    if (error) {
        authError.value = 'Failed to join room.'
        console.error('Error joining room:', error)
        return
    }
    // Join the realtime channel for this room by room ID
    gameChannel.value = supabase.channel(`${roomCode}`, {
        config: { broadcast: { self: true }, presence: { key: playerId.value } }
    })

    if (!gameChannel.value) {
        authError.value = 'Failed to join game channel.'
        return
    }

    gameChannel.value.on('presence', { event: 'sync' }, () => {
        const newState = gameChannel.value.presenceState()

        if (!newState) {
            authError.value = 'Failed to get presence state.'
            return
        }

        players.value = Object.keys(newState)
            .map(key => newState[key][0])
            .sort((a, b) => (a.joined_at ?? 0) - (b.joined_at ?? 0))
    })

    gameChannel.value.on('broadcast', { event: 'cards_dealt' }, async (payload) => {
        console.log('[BROADCAST] cards_dealt')
        const { data } = await supabase.from("hand_cards").select("*").eq("room_id", roomId.value).eq("user_id", playerId.value)
        playerHandCards.value = data ?? []
        console.log("playerHandCards:", playerHandCards.value)
    })

    gameChannel.value.on('broadcast', { event: 'game_initialize' }, async (body) => {
        console.log('[BROADCAST] game_initialize: ', body.payload)
        collectionCards.value = await supabase.from("cards").select("*").eq("collection_id", body.payload.set_id)
        console.log("collectionCards:", collectionCards.value)

    })

    gameChannel.value.on('broadcast', { event: 'game_start' }, () => {
        console.log('[BROADCAST] game_start')
        gameStarted.value = true
        roundStatus.value = 'SELECTION'
    })

    // gameChannel.on('postgres_changes', {
    //     event: 'INSERT',
    //     schema: 'public',
    //     table: 'game_moves',
    //     filter: `room_id=eq.${existingRoom.id}`
    // }, (payload) => {
    //     handleMove(payload.new)
    // })

    gameChannel.value.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await gameChannel.value.track({
                user_id: playerId.value,
                user_name: currentUser.user_metadata.full_name || 'Guest',
                status: 'playing',
                joined_at: Date.now()
            })
        }
    })
})

// ACTION - Start game
const startGame = async () => {
    if (!gameChannel.value || players.value.length < 2 || !isGameMaster.value) {
        if (players.value.length < 2) authError.value = 'Need at least 2 players to start.'
        return
    }

    // Fetch available card sets and pick the first one
    const sets = await getCardSets()
    if (!sets || sets.length === 0) {
        authError.value = 'No card sets available.'
        return
    }

    gameChannel.value.send({
        type: "broadcast",
        event: "game_initialize",
        payload: { set_id: sets[0].id } // For now we just hardcode a set, but you could add a UI to select one
    })

    gameChannel.value.send({
      type: "broadcast",
      event: "game_start",
    })

    // Get the current session token to authorise the edge function call
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        authError.value = 'Not authenticated.'
        return
    }

    const { data: edgeInitializeData } = await supabase.functions.invoke('initialize_game', {
        method: 'POST',
        body: { set_id: sets[0].id, room_id: roomId.value, cardsPerPlayer: 8}
    })

    if (!edgeInitializeData) {
        authError.value = 'Failed to assign hand cards.'
        return
    }

    const { data: edgeGetBlackData } = await supabase.functions.invoke('initialize_game', {
        method: 'POST',
        body: { set_id: sets[0].id, room_id: roomId.value, cardsPerPlayer: 8}
    })

    if (!edgeGetBlackData) {
        authError.value = 'Failed to assign hand cards.'
        return
    }




    gameChannel.value.send({
      type: "broadcast",
      event: "cards_dealt",
    })
}

const recordMove = async (payload) => {

}

const playCard = async (card) => {

}

const selectWinner = async (playedCard) => {

}

const nextRound = async () => {

}

const handleMove = async (move) => {

}

const dealInitialHand = async (whiteDeckIds) => {

}

const refillHand = async () => {

}

const leaveRoom = async () => {
    const { error } = await supabase.from('room_members')
        .delete()
        .eq('room_id', roomId.value)
        .eq('user_id', playerId.value)

    if (error) {
        console.error('Error leaving room:', error)
        return
    }

    isLeaving.value = true
    await navigateTo('/')
}

const markMemberInactive = async () => {
    if (!playerId.value || !roomId.value) return
    await supabase
        .from('room_members')
        .update({ is_active: false, left_at: new Date().toISOString() })
        .eq('room_id', roomId.value)
        .eq('user_id', playerId.value)
}

onUnmounted(() => {
    if (!isLeaving.value) markMemberInactive()
    if (gameChannel.value) supabase.removeChannel(gameChannel.value)
})
</script>

<template>
    <div class="flex flex-col items-center min-h-screen bg-gray-100 p-6">

        <!-- Header Card -->
        <div class="bg-white rounded shadow-md w-full max-w-2xl p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h1 class="text-2xl font-bold">Room: {{ roomCode }}</h1>
                    <p class="text-sm text-gray-500">{{ players.length }} players online</p>
                </div>
                <div class="flex gap-2">
                    <button v-if="!gameStarted && isGameMaster" @click="startGame"
                        class="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded hover:bg-blue-600">
                        Start Game
                    </button>
                    <button @click="leaveRoom"
                        class="px-4 py-2 text-gray-500 border border-gray-300 text-sm rounded hover:bg-gray-50">
                        Leave
                    </button>
                </div>
            </div>

            <!-- Player List -->
            <div class="flex flex-wrap gap-2">
                <div v-for="player in players" :key="player.user_id"
                    class="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
                    :class="czarId === player.user_id ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'">
                    <span>{{ player.user_name }}</span>
                    <span v-if="czarId === player.user_id" class="font-bold">CZAR</span>
                    <span class="text-gray-400">({{ scores[player.user_id] || 0 }})</span>
                </div>
            </div>
        </div>

        <p v-if="authError" class="text-red-500 text-sm mb-4">{{ authError }}</p>

        <!-- Game Area -->
        <div v-if="gameStarted" class="w-full max-w-2xl space-y-6">

            <!-- Black Card -->
            <div class="flex justify-center">
                <div v-if="blackCard"
                    class="relative h-64 w-48 rounded bg-gray-900 p-6 text-lg font-bold text-white shadow-md">
                    <div
                        v-html="blackCard.text.replace(/_/g, '<span class=\'border-b-2 border-white px-4 inline-block\'></span>')">
                    </div>
                    <div class="absolute bottom-4 right-4 text-xs">STUW2</div>
                </div>
            </div>

            <!-- Status Message -->
            <div class="bg-white rounded shadow-md p-6 text-center">
                <p v-if="roundStatus === 'SELECTION'" class="text-lg font-medium text-gray-700">
                    {{ isCzar ? 'Waiting for players to pick...' : (myPlayedCard ? 'Waiting for others...' : 'Pick a white card!') }}
                </p>
                <p v-if="roundStatus === 'JUDGING'" class="text-lg font-medium text-blue-600">
                    {{ isCzar ? 'Pick the winner!' : 'The Czar is judging...' }}
                </p>
                <div v-if="roundStatus === 'WINNER'" class="space-y-3">
                    <p class="text-xl font-bold text-green-600">Winner found!</p>
                    <button v-if="isGameMaster" @click="nextRound"
                        class="px-6 py-2 bg-blue-500 text-white font-semibold rounded hover:bg-blue-600">
                        Next Round
                    </button>
                </div>
            </div>

            <!-- Judging Area -->
            <div v-if="roundStatus === 'JUDGING' || roundStatus === 'WINNER'"
                class="flex flex-wrap justify-center gap-4">
                <div v-for="(play, idx) in playedCards" :key="idx" @click="selectWinner(play)"
                    class="h-64 w-48 cursor-pointer rounded border-2 bg-white p-4 font-bold shadow-md transition-all hover:-translate-y-2"
                    :class="winner?.winnerId === play.playerId ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-blue-400'">
                    {{ play.card.text }}
                </div>
            </div>

            <!-- Player Hand -->
            <div v-if="!isCzar">
                <h3 class="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-gray-500">Your Hand</h3>
                <div class="flex flex-wrap justify-center gap-3">
                    <div v-for="card in playerHandCards" :key="card.id" @click="playCard(card)"
                        class="h-48 w-36 cursor-pointer rounded border border-gray-200 bg-white p-4 text-sm font-bold shadow-sm transition-all hover:-translate-y-2 hover:border-blue-400 hover:shadow-md"
                        :class="myPlayedCard?.id === card.id ? 'opacity-50 grayscale' : ''">
                        {{ (collectionCards.data || []).find(c => c.id === card.card_id)?.text || 'Loading...' }}
                    </div>
                </div>
            </div>
        </div>

        <!-- Waiting for game to start -->
        <div v-else class="bg-white rounded shadow-md w-full max-w-2xl p-12 flex flex-col items-center justify-center">
            <p class="text-gray-500">Waiting for the Game Master to start...</p>
        </div>
    </div>
</template>