import type { Tables } from "~~/types/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

type HandCards = Tables<"hand_cards">;
type CollectionCards = Tables<"cards">;

export function useRoom() {
  const user = useSupabaseUser();
  const presenceJoinedAt: number = Date.now();

  // VARIABLES
  const supabase = useSupabaseClient();
  const gameChannel = useState<RealtimeChannel | null>(
    "gameChannel",
    () => null,
  );

  const gameMasterId = ref<string>("");
  const { handleGameStateChanges } = useGameManager();

  const isLeaving = ref<boolean>(false);
  const gameStarted = useState<boolean>("gameStarted", () => false);
  const players = useState<any[]>("players", () => []);
  const playerHandCards = ref<HandCards[]>([]);
  const collectionCards = ref<CollectionCards[]>([]);

  async function getRoomIdByCode(roomCode: string): Promise<string> {
    const { data } = await supabase
      .from("rooms")
      .select("id, code, metadata")
      .eq("code", roomCode)
      .maybeSingle();

    if (!data) {
      console.error("Room does not exist.");
      return "";
    }
    return data.id;
  }

  async function getRoomMetadata(roomId: string) {
    const { data } = await supabase
      .from("rooms")
      .select("metadata")
      .eq("id", roomId)
      .maybeSingle();

    if (!data) {
      console.error("Room does not exist.");
      return null;
    }
    return data;
  }

  async function deletePlayerFromRoomTable(roomId: string, playerId: string) {
    if (!roomId || !playerId) return;

    try {
      console.log(
        `[Leave] Player ${playerId} attempting to leave room ${roomId}`,
      );

      // 1. Check if leaving player is the owner (game master)
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("owner")
        .eq("id", roomId)
        .single();

      if (roomError) {
        console.error("[Leave] Error fetching room:", roomError);
        return;
      }

      console.log(
        `[Leave] Current owner: ${room?.owner}, leaving player: ${playerId}`,
      );

      if (room?.owner === playerId) {
        console.log(
          "[Leave] Leaving player IS the owner, finding successor...",
        );

        // 2. Find the next player in join order (oldest member)
        const { data: nextPlayers, error: nextPlayersError } = await supabase
          .from("room_members")
          .select("user_id")
          .eq("room_id", roomId)
          .neq("user_id", playerId)
          .order("joined_at", { ascending: true })
          .limit(1);

        if (nextPlayersError) {
          console.error("[Leave] Error finding next player:", nextPlayersError);
        }

        const nextPlayer = nextPlayers?.[0];

        if (nextPlayer) {
          console.log(`[Leave] Promoting ${nextPlayer.user_id} to owner`);

          const { error: updateError } = await supabase
            .from("rooms")
            .update({
              owner: nextPlayer.user_id,
            })
            .eq("id", roomId);

          if (updateError) {
            console.error("[Leave] Error updating owner:", updateError);
          } else {
            console.log(`[Owner] Promoted ${nextPlayer.user_id} to owner`);
          }
        } else {
          console.log("[Leave] No other players found to promote");
        }
      }

      // 3. Now delete the player
      const { error: deleteError } = await supabase
        .from("room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", playerId);

      if (deleteError) {
        console.error("Error leaving room:", deleteError);
        return;
      }

      isLeaving.value = true;
      resetPlayerList();
      await navigateTo("/");
    } catch (err) {
      console.error("Error in deletePlayerFromRoomTable:", err);
    }
  }

  async function markMemberInactive(roomId: string, playerId: string) {
    supabase
      .from("room_members")
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", playerId);
  }

  async function trackMyStatus(myPresenceStatus: string) {
    if (!gameChannel.value || !user.value || !user.value.sub) return;

    await gameChannel.value.track({
      user_id: user.value.sub,
      user_name: user.value.user_metadata?.full_name,
      status: myPresenceStatus,
      joined_at: presenceJoinedAt,
    });
  }

  async function resetPlayerList() {
    players.value = [];
  }

  async function enterRoom(
    roomId: string,
    roomCode: string,
    playerId: string,
    initialStatus: string | null,
  ) {
    await joinRoom(roomCode, playerId);
    await insertPlayerInRoomTable(roomId, playerId);
    await setupBroadcastListeners(roomId, playerId);

    gameChannel.value?.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await trackMyStatus(initialStatus);
      }
    });
  }

  async function insertPlayerInRoomTable(roomId: string, playerId: string) {
    const { error } = await supabase.from("room_members").upsert(
      {
        room_id: roomId,
        user_id: playerId,
        role: "player",
        is_active: true,
        left_at: null,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "room_id,user_id" },
    );

    if (error) {
      console.error("Error joining room:", error);
      return;
    }
  }

  async function joinRoom(roomCode: string, playerId: string) {
    if (gameChannel.value !== null) {
      supabase.removeAllChannels();
      gameChannel.value = null;
      console.warn(
        "Existing game channel found. Unsubscribing before joining new room.",
      );
    }

    gameChannel.value = supabase.channel(`${roomCode}`, {
      config: { broadcast: { self: true }, presence: { key: playerId } },
    });

    if (!gameChannel.value) {
      console.error("Failed to join game channel.");
      return;
    }
  }

  async function setupBroadcastListeners(roomId: string, playerId: string) {
    // Validation
    if (!gameChannel.value && !user.value) {
      console.error("[useRoom.ts] Game channel or user not initialized.");
      return;
    }

    // PRESENCE SYNC
    gameChannel.value.on("presence", { event: "sync" }, () => {
      const state = gameChannel.value.presenceState() ?? {};

      players.value = Object.values(state)
        .map((arr: any) => arr?.[0])
        .filter(Boolean)
        .sort((a: any, b: any) => (a?.joined_at ?? 0) - (b?.joined_at ?? 0));
    });

    // BROADCAST LISTENERS
    // cards_dealt
    gameChannel.value.on("broadcast", { event: "cards_dealt" }, async () => {
      console.log("[BROADCAST] cards_dealt");
      const { data, error } = await supabase
        .from("hand_cards")
        .select("*")
        .eq("room_id", roomId)
        .eq("user_id", playerId);

      if (error) {
        console.error("Error fetching hand cards:", error);
        return;
      }
      playerHandCards.value = data ?? [];
      console.log("Updated player hand cards: ", playerHandCards.value);
    });

    // game_initialize
    gameChannel.value.on(
      "broadcast",
      { event: "game_initialize" },
      async (body) => {
        console.log("[BROADCAST] game_initialize: ", body);
        const { data: data2, error: error2 } = await supabase
          .from("cards")
          .select("*")
          .eq("collection_id", body.payload.set_id);

        if (error2) {
          console.error("Error fetching collection cards:", error2);
          return;
        }
        collectionCards.value = data2 ?? [];
      },
    );

    // game_start
    gameChannel.value.on("broadcast", { event: "game_start" }, () => {
      console.log("[BROADCAST] game_start");
      gameStarted.value = true;
    });

    // Realtime table listeners (after channel is created)
    gameChannel.value?.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        console.log("[POSTGRES CHANGES] rooms updated: ", payload);
        if (payload.new.owner) {
          gameMasterId.value = payload.new.owner;
        }

        const metadata = payload.new.metadata as any;
        if (metadata) handleGameStateChanges(metadata);
      },
    );
  }

  return {
    // Variables
    isLeaving,
    players,
    playerHandCards,
    collectionCards,
    gameMasterId,

    // Functions
    getRoomIdByCode,
    getRoomMetadata,
    insertPlayerInRoomTable,
    joinRoom,
    enterRoom,
    deletePlayerFromRoomTable,
    markMemberInactive,
    trackMyStatus,
    setupBroadcastListeners,
  };
}
