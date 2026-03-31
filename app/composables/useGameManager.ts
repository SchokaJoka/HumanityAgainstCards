import type { RealtimeChannel } from "@supabase/supabase-js";

export function useGameManager() {
  const supabase = useSupabaseClient();

  const players = useState<any[]>("players", () => []);
  const gameChannel = useState<RealtimeChannel | null>(
    "gameChannel",
    () => null,
  );
  const isGameMaster = useState<boolean>("isGameMaster", () => false);
  const gameState = useState<any>("gameState", () => ({}));
  const roundStatus = useState<string>("roundStatus", () => "lobby");
  const winnerUserId = useState<string | null>("winnerUserId", () => null);
  const winnerUsername = useState<string>("winnerUsername", () => "");
  const winnerCards = useState<any[]>("winnerCards", () => []);
  const playerSubmissions = useState<any[]>("playerSubmissions", () => []);
  const blackCard = useState<any | null>("blackCard", () => null);
  const isWhiteCardsSubmitted = useState<boolean>(
    "isWhiteCardsSubmitted",
    () => false,
  );
  const myChosenWhiteCards = useState<any[]>("myChosenWhiteCards", () => []);

  const isStartingGame = ref(false);
  const isStartingNextRound = ref(false);

  const errorMessage = useState<string | null>("gameErrorMessage", () => null);

  const roomId = useState<string | null>("gameManagerRoomId", () => null);
  const playerId = useState<string | null>("gameManagerPlayerId", () => null);

  const gameStarted = useState<boolean>("gameStarted", () => false);

  const { getCardCollections } = useCards();

  /*   async function getGameMasterId(roomId: string): Promise<string | null> {
    const { data } = await supabase
      .from("rooms")
      .select("owner")
      .eq("id", roomId)
      .single();

    return data?.owner ?? null;
  } */

  async function initializeGame(
    roomId: string,
    roomCode: string,
    dev2gaps: boolean,
    collectionId: string,
    mode: "classic" | "extended",
  ) {
    console.log("[GameManager] initializeGame called with:", {
      roomId,
      roomCode,
      dev2gaps,
      collectionId,
    });

    if (!gameChannel.value || players.value.length < 2 || !isGameMaster.value) {
      if (players.value.length < 2)
        //display error message on html page that at least 2 players are required
        errorMessage.value =
          "At least 2 players are required to start the game.";
      return;
    }

    if (isStartingGame.value) return;
    isStartingGame.value = true;

    console.log("[GameManager] Broadcasting navigate_to_game");
    gameChannel.value.send({
      type: "broadcast",
      event: "navigate_to_game",
      payload: { roomCode, mode },
    });

    console.log("[GameManager] Broadcasting game_initialize");
    gameChannel.value.send({
      type: "broadcast",
      event: "game_initialize",
      payload: { set_id: collectionId },
    });

    console.log("[GameManager] Broadcasting game_start");
    gameChannel.value.send({
      type: "broadcast",
      event: "game_start",
    });

    console.log("[GameManager] Invoke initialize_game");
    const { data: edgeInitializeData } = await supabase.functions.invoke(
      "initialize_game",
      {
        method: "POST",
        body: {
          set_id: collectionId,
          room_id: roomId,
          cardsPerPlayer: 8,
          dev2gaps: dev2gaps,
        },
      },
    );

    if (!edgeInitializeData) {
      console.error("Failed to assign hand cards.");
      return;
    }

    console.log("[GameManager] gameChannel:", gameChannel.value);

    console.log("[GameManager] Broadcasting cards_dealt");
    gameChannel.value.send({
      type: "broadcast",
      event: "cards_dealt",
      payload: { roomId },
    });

    isStartingGame.value = false;
  }

  async function initializeCreativeGame(roomId: string, roomCode: string) {
    if (!gameChannel.value || players.value.length < 2 || !isGameMaster.value) {
      if (players.value.length < 2) {
        errorMessage.value =
          "At least 2 players are required to start the game.";
      }
      return;
    }

    if (isStartingGame.value) return;
    isStartingGame.value = true;

    gameChannel.value.send({
      type: "broadcast",
      event: "navigate_to_game",
      payload: { roomCode, mode: "creative" },
    });

    gameChannel.value.send({
      type: "broadcast",
      event: "game_start",
    });

    let czarId = players.value[0]?.user_id;
    if (!czarId) {
      const { data: members } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });
      czarId = members?.[0]?.user_id ?? null;
    }

    if (!czarId) {
      console.error("[GameManager] Failed to determine czar for creative mode");
      isStartingGame.value = false;
      return;
    }

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("metadata")
      .eq("id", roomId)
      .single();

    if (roomErr) {
      console.error("[GameManager] Failed to load room metadata", roomErr);
      isStartingGame.value = false;
      return;
    }

    const nextMetadata = {
      ...(room?.metadata ?? {}),
      mode: "creative",
      set_id: null,
      handSize: 1,
      round: 1,
      round_status: "round_start",
      czar_id: czarId,
      black_card: null,
      current_winner: null,
      played_black_cards: room?.metadata?.played_black_cards ?? [],
      played_white_cards: room?.metadata?.played_white_cards ?? [],
    };

    const { error: updateErr } = await supabase
      .from("rooms")
      .update({ metadata: nextMetadata })
      .eq("id", roomId);

    if (updateErr) {
      console.error("[GameManager] Failed to init creative game", updateErr);
    }

    isStartingGame.value = false;
  }

  // ACTION - Start next round (Czar)
  async function initializeNextRound(roomId: string | null) {
    if (!roomId || !gameChannel.value) return;
    if (isStartingNextRound.value) return;
    isStartingNextRound.value = true;

    try {
      const { data, error } = await supabase.functions.invoke(
        "initialize_next_round",
        {
          method: "POST",
          body: {
            room_id: roomId,
          },
        },
      );

      if (error) {
        throw new Error(`Error initializing next round: ${error.message}`);
      } else {
        console.log("[EDGE] success initialize_next_round", data);
        gameChannel.value.send({
          type: "broadcast",
          event: "cards_dealt",
          payload: { roomId },
        });
      }
    } catch (e) {
      console.error("Error starting next round:", e);
    } finally {
      isStartingNextRound.value = false;
    }
  }

  async function handleGameStateChanges(currentMetaData: any) {
    gameState.value = currentMetaData;
    console.log("[HANDLEGAMESTATECHANGES] gameState: ", gameState.value);
    roundStatus.value = currentMetaData.round_status;
    gameStarted.value = currentMetaData.round_status !== "lobby";

    switch (currentMetaData.round_status) {
      case "round_start":
        console.log("Round start case triggered");
        await handleRoundStart(currentMetaData);
        break;
      case "round_submitted":
        console.log("Round submitted case triggered");
        await handleRoundSubmitted(currentMetaData);
        break;
      case "round_end":
        console.log("Round end case triggered");
        await handleRoundEnd(currentMetaData);
        break;
      case "lobby":
        console.warn("In lobby, waiting for game to start...");
        break;
      default:
        console.warn("Unknown round status:", currentMetaData.round_status);
    }
  }

  async function handleRoundStart(currentMetaData: any) {
    winnerUserId.value = null;

    if (!roomId.value || !playerId.value) return;

    // Load player submission status
    const { data, error } = await supabase
      .from("room_members")
      .select("status")
      .eq("room_id", roomId.value)
      .eq("user_id", playerId.value);

    if (error) {
      console.error("Error checking submission status:", error);
      return;
    }

    isWhiteCardsSubmitted.value = data?.[0]?.status === "submitted";

    blackCard.value = currentMetaData.black_card ?? null;
  }

  async function handleRoundSubmitted(currentMetaData: any) {
    winnerUserId.value = null;

    const czarId = gameState.value?.czar_id;
    if (!czarId || !roomId.value || !playerId.value) return;

    const { data, error } = await supabase
      .from("room_members")
      .select("*")
      .eq("room_id", roomId.value)
      .neq("user_id", czarId);

    const { error: error2 } = await supabase
      .from("room_members")
      .update({ status: "waiting" })
      .eq("room_id", roomId.value)
      .eq("user_id", playerId.value);

    if (error) {
      console.error("Error loading submitted white cards:", error);
      return;
    }

    if (error2) {
      console.error("Error updating player status to waiting:", error2);
      return;
    }

    // isWhiteCardsSubmitted is managed in the component
    isWhiteCardsSubmitted.value = false;
    myChosenWhiteCards.value = [];
    blackCard.value = currentMetaData.black_card ?? null;

    playerSubmissions.value = data ?? [];
    console.log("submittedWhiteCards: ", playerSubmissions.value);
  }

  async function handleRoundEnd(currentMetaData: any) {
    const winnerId = currentMetaData.current_winner?.user_id;
    if (!winnerId) return;
    winnerUserId.value = winnerId;
    blackCard.value = currentMetaData.black_card ?? null;
    winnerUsername.value =
      players.value.find((p) => p.user_id === winnerId)?.user_name || "";
    winnerCards.value =
      currentMetaData.current_winner?.metadata?.submitted_cards ?? [];
  }

  return {
    // Variables
    isStartingGame,
    isStartingNextRound,
    errorMessage,
    gameChannel,
    gameState,
    roundStatus,
    blackCard,
    playerSubmissions,
    winnerUserId,
    winnerUsername,
    winnerCards,
    gameManagerRoomId: roomId,
    gameManagerPlayerId: playerId,

    // Functions
    initializeGame,
    initializeCreativeGame,
    initializeNextRound,
    /* getGameMasterId, */
    handleGameStateChanges,
  };
}
