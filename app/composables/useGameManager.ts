import type { RealtimeChannel } from "@supabase/supabase-js";

export function useGameManager() {
  const supabase = useSupabaseClient();

  const players = useState<any[]>("players", () => []);
  const gameChannel = useState<RealtimeChannel | null>(
    "gameChannel",
    () => null,
  );
  const isGameMaster = useState<boolean>("isGameMaster", () => false);

  const isStartingGame = ref(false);
  const isStartingNextRound = ref(false);

  const { getCardCollections } = useCards();

  async function setGameMasterIfNotExists(roomId: string, playerId: string) {
    console.log(
      `[GameMaster] Starting setGameMasterIfNotExists for player: ${playerId}`,
    );

    const { data: room } = await supabase
      .from("rooms")
      .select("metadata")
      .eq("id", roomId)
      .maybeSingle();

    const metadata = room?.metadata || {};
    console.log(`[GameMaster] Initial metadata read:`, metadata);

    if (!metadata.game_master_id) {
      console.log(
        `[GameMaster] No game_master_id found, setting to: ${playerId}`,
      );

      // CREATE A NEW OBJECT - don't mutate the original
      const newMetadata = {
        ...metadata,
        game_master_id: playerId,
      };

      console.log(`[GameMaster] New metadata to send:`, newMetadata);

      const { error } = await supabase
        .from("rooms")
        .update({ metadata: newMetadata }) // Use the NEW object
        .eq("id", roomId);

      if (error) {
        console.error("Error setting game master:", error);
        return null;
      }

      console.log(`[GameMaster] Update sent successfully, reading back...`);

      // Add a small delay to allow propagation
      await new Promise((resolve) => setTimeout(resolve, 150));

      const { data: updatedRoom } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", roomId)
        .maybeSingle();

      const finalMasterId = updatedRoom?.metadata?.game_master_id;
      console.log(
        `[GameMaster] Final read - game_master_id: ${finalMasterId}, expected: ${playerId}`,
      );

      return finalMasterId ?? playerId;
    } else {
      console.log(
        `[GameMaster] game_master_id already exists: ${metadata.game_master_id}`,
      );
      return metadata.game_master_id;
    }
  }

  async function getGameMasterId(roomId: string) {
    const { data } = await supabase
      .from("rooms")
      .select("metadata")
      .eq("id", roomId)
      .maybeSingle();

    return data?.metadata?.game_master_id ?? null;
  }

  async function initializeGame(roomId: string, dev2gaps: boolean) {
    if (!gameChannel.value || players.value.length < 2 || !isGameMaster.value) {
      if (players.value.length < 2)
        console.error("Need at least 2 players to start.");
      return;
    }

    if (isStartingGame.value) return;
    isStartingGame.value = true;

    try {
      // Fetch available card sets and pick the first one
      const sets = await getCardCollections();
      if (!sets || sets.length === 0) {
        console.error("No card sets available.");
        return;
      }

      gameChannel.value.send({
        type: "broadcast",
        event: "game_initialize",
        payload: { set_id: sets[0].id }, // For now we just hardcode a set, but you could add a UI to select one
      });

      gameChannel.value.send({
        type: "broadcast",
        event: "game_start",
      });

      const { data: edgeInitializeData } = await supabase.functions.invoke(
        "initialize_game",
        {
          method: "POST",
          body: {
            set_id: sets[0].id,
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

      gameChannel.value.send({
        type: "broadcast",
        event: "cards_dealt",
      });
    } finally {
      isStartingGame.value = false;
    }
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
        });
      }
    } catch (e) {
      console.error("Error starting next round:", e);
    } finally {
      isStartingNextRound.value = false;
    }
  }

  return {
    // Variables
    isStartingGame,
    isStartingNextRound,

    // Functions
    initializeGame,
    initializeNextRound,
    getGameMasterId,
    setGameMasterIfNotExists,
  };
}
