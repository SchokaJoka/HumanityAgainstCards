import type { RealtimeChannel } from "@supabase/supabase-js";

export function useGameManager() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();

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

  const gameStarted = useState<boolean>("gameStarted", () => false);

  const isCzar = useState<boolean>("isCzar", () => false);

  const myChosenWhiteCards = useState<any[]>("myChosenWhiteCards", () => []);

  const isStartingGame = ref(false);
  const isStartingNextRound = ref(false);

  const errorMessage = useState<string | null>("gameErrorMessage", () => null);

  const roomId = useState<string | null>("roomId", () => null);
  const playerId = useState<string | null>("playerId", () => null);

  const myPresenceStatus = computed(() => {
    if (!gameStarted.value) {
      return "waiting";
    }

    switch (roundStatus.value) {
      case "lobby":
        return "waiting";
        break;

      case "round_start":
        if (isCzar.value) {
          return "czar";
        } else {
          return isWhiteCardsSubmitted.value ? "submitted" : "choosing";
        }
        break;

      case "round_submitted":
        return isCzar.value ? "judging" : "waiting";
        break;

      case "round_end":
        return winnerUserId.value && winnerUserId.value === playerId.value
          ? "winner"
          : "round_end";
        break;

      default:
        return "error_unknown_status";
    }
  });

  const updateIfChanged = <T>(clientRef: Ref<T>, newValue: T) => {
    if (clientRef.value !== newValue) {
      clientRef.value = newValue;
    }
  };

  watch([players, playerId], ([nextPlayers, nextPlayerId]) => {
    if (!nextPlayerId) return;
    const self = (nextPlayers ?? []).find(
      (player: any) => player.user_id === nextPlayerId,
    );
    if (!self || typeof self.status !== "string") return;
    isWhiteCardsSubmitted.value = self.status === "submitted";
  });

  async function ensureGameChannelJoined(): Promise<boolean> {
    if (!gameChannel.value) return false;

    const state = (gameChannel.value as any).state;
    if (state === "joined") return true;

    const timeoutMs = 5000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const currentState = (gameChannel.value as any)?.state;
      if (currentState === "joined") return true;
      if (currentState === "closed" || currentState === "errored") {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return (gameChannel.value as any)?.state === "joined";
  }

  async function initializeGame(
    roomId: string,
    roomCode: string,
    dev2gaps: boolean,
    collectionIds: string[] | string | null = null,
    mode: "classic" | "creative",
  ): Promise<boolean> {
    if (!gameChannel.value || players.value.length < 2 || !isGameMaster.value) {
      if (players.value.length < 2)
        //display error message on html page that at least 2 players are required
        errorMessage.value =
          "At least 2 players are required to start the game.";
      return false;
    }

    if (isStartingGame.value) return false;
    isStartingGame.value = true;

    try {
      const invokeBody: any = {
        // set_id may be a single id or an array of ids
        set_id: collectionIds,
        room_id: roomId,
        // at least 4 at most 8 cards per player depending on how big set is. but if once started with for example 4 cards per player a game it should always be 4 in this room and so it is for example if started with 8
        dev2gaps: dev2gaps,
        mode: mode,
      };

      const { data: edgeInitializeData, error: invokeError } =
        await supabase.functions.invoke("initialize_game", {
          method: "POST",
          body: invokeBody,
        });

      if (invokeError) {
        console.error(
          "Failed to assign hand cards (initialize_game):",
          invokeError,
        );
        errorMessage.value =
          invokeError.message || "Failed to initialize game.";
        isStartingGame.value = false;
        return false;
      }

      if (!edgeInitializeData) {
        console.error(
          "Failed to assign hand cards (initialize_game): empty response",
        );
        errorMessage.value = "Failed to initialize game (no response).";
        isStartingGame.value = false;
        return false;
      }

      // Edge function may return JSON with an error field even on 2xx
      if ((edgeInitializeData as any)?.error) {
        const msg = (edgeInitializeData as any).error;
        console.error("Edge initialize_game returned error:", msg);
        errorMessage.value =
          typeof msg === "string" ? msg : JSON.stringify(msg);
        isStartingGame.value = false;
        return false;
      }
    } catch (e) {
      console.error("Error invoking initialize_game:", e);
      isStartingGame.value = false;
      return false;
    }

    const isJoined = await ensureGameChannelJoined();
    if (!isJoined) {
      errorMessage.value =
        "Realtime channel is not connected. Please try again.";
      isStartingGame.value = false;
      return false;
    }

    // After server writes complete, broadcast navigation and start events so clients receive authoritative state
    gameChannel.value.send({
      type: "broadcast",
      event: "navigate_to_game",
      payload: { roomCode, mode },
    });

    if (mode !== "creative") {
      gameChannel.value.send({
        type: "broadcast",
        event: "game_initialize",
        payload: { set_id: collectionIds },
      });
    }

    gameChannel.value.send({
      type: "broadcast",
      event: "game_start",
    });

    isStartingGame.value = false;
    return true;
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
        const isJoined = await ensureGameChannelJoined();
        if (!isJoined) {
          throw new Error("Realtime channel is not connected.");
        }
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

  async function handleGameStateChanges(
    currentMetaData: any,
    roomCode: string,
  ) {
    updateIfChanged(blackCard, currentMetaData.black_card ?? null);
    updateIfChanged(gameState, currentMetaData);
    updateIfChanged(roundStatus, currentMetaData.round_status);
    updateIfChanged(gameStarted, currentMetaData.round_status !== "lobby");

    // await trackMyStatus(myPresenceStatus.value, roomId.value ?? "");

    switch (currentMetaData.round_status) {
      case "round_create_black_card":
        await handleRoundStart(currentMetaData);
        break;
      case "round_start":
        await handleRoundStart(currentMetaData);
        break;
      case "round_submitted":
        await handleRoundSubmitted(currentMetaData);
        break;
      case "round_end":
        await handleRoundEnd(currentMetaData);
        break;
      case "lobby":
        handleLobby(currentMetaData, roomCode);
        break;
      default:
        console.error("Unknown round status:", currentMetaData.round_status);
    }

    // Status is authoritative on the server via edge functions; avoid overwriting it here.
  }

  async function handleRoundStart(currentMetaData: any) {
    winnerUserId.value = null;
    playerSubmissions.value = [];

    if (!roomId.value || !playerId.value) return;

    const selfEntry = players.value.find(
      (player) => player.user_id === playerId.value,
    );
    if (selfEntry && typeof selfEntry.status === "string") {
      isWhiteCardsSubmitted.value = selfEntry.status === "submitted";
      return;
    }

    // Load player submission status
    const { data, error } = await supabase
      .from("room_members")
      .select("status")
      .eq("room_id", roomId.value)
      .eq("user_id", playerId.value)
      .limit(1);

    if (error) {
      console.error("Error checking submission status:", error);
      return;
    }

    const status = data?.[0]?.status;
    if (!status) {
      console.warn(
        "[useGameManager] No room_members row found for current user; check join_room or RLS.",
      );
      isWhiteCardsSubmitted.value = false;
      return;
    }

    isWhiteCardsSubmitted.value = status === "submitted";
  }

  async function handleRoundSubmitted(currentMetaData: any) {
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

    isWhiteCardsSubmitted.value = false;
    myChosenWhiteCards.value = [];

    playerSubmissions.value = data ?? [];
  }

  async function handleRoundEnd(currentMetaData: any) {
    const winnerId = currentMetaData.current_winner?.user_id;
    if (!winnerId) return;
    winnerUserId.value = winnerId;
    winnerUsername.value =
      players.value.find((p) => p.user_id === winnerId)?.user_name ?? "";
    winnerCards.value =
      currentMetaData.current_winner?.metadata?.submitted_cards;
  }

  async function handleLobby(currentMetaData: any, roomCode: string) {
    myChosenWhiteCards.value = [];
    if (roomCode) {
      navigateTo(`/play/${roomCode}/lobby`);
    } else {
      console.error("Cannot Navigate to Lobby! roomCode not defined.");
    }
  }

  async function trackMyStatus(myPresenceStatus: string, roomId: string) {
    if (!user.value) return;

    const { error } = await supabase
      .from("room_members")
      .update({ status: myPresenceStatus })
      .eq("room_id", roomId)
      .eq("user_id", user.value.sub);

    if (error) {
      console.error("[useRoom] Failed to update player status", error);
    }
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
    trackMyStatus,
    initializeGame,
    /*  initializeCreativeGame, */
    initializeNextRound,
    /* getGameMasterId, */
    handleGameStateChanges,
  };
}
