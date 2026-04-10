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

  const gameMasterId = useState<string>("gameMasterId", () => "");
  const { updatePlayerScoreFromMember } = usePlayerScores();
  const { handleGameStateChanges } = useGameManager();

  const isLeaving = ref<boolean>(false);
  const gameStarted = useState<boolean>("gameStarted", () => false);
  const players = useState<any[]>("players", () => []);
  const playerHandCards = useState<HandCards[]>("playerHandCards", () => []);
  const collectionCards = useState<CollectionCards[]>(
    "collectionCards",
    () => [],
  );

  const selectedGameMode = useState<"classic" | "creative">(
    "selectedGameMode",
    () => "classic",
  );

  // FUNCTIONS

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

      if (room?.owner === playerId) {
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
          const { error: updateError } = await supabase
            .from("rooms")
            .update({
              owner: nextPlayer.user_id,
            })
            .eq("id", roomId);

          if (updateError) {
            console.error("[Leave] Error updating owner:", updateError);
          }
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

  async function trackMyPresence() {
    if (!gameChannel.value || !user.value || !user.value.sub) return;
    if (gameChannel.value.state !== "joined") return;

    try {
      await gameChannel.value.track({
        user_id: user.value.sub,
        user_name: user.value.user_metadata?.full_name,
        joined_at: presenceJoinedAt,
      });
    } catch (error) {
      console.warn("[useRoom] Failed to track presence", error);
    }
  }

  async function trackMyStatus(myPresenceStatus: string, roomId: string) {
    if (!user.value || !user.value.sub) return;

    try {
      const { error } = await supabase
        .from("room_members")
        .update({ status: myPresenceStatus })
        .eq("room_id", roomId)
        .eq("user_id", user.value.sub);

      if (error) {
        console.warn("[useRoom] Failed to update player status", error);
      }
    } catch (error) {
      console.warn("[useRoom] Error updating player status", error);
    }
  }

  async function resetPlayerList() {
    players.value = [];
  }

  async function loadInitialHandCards(roomId: string, playerId: string) {
    const { data, error } = await supabase
      .from("hand_cards")
      .select("*")
      .eq("room_id", roomId)
      .eq("user_id", playerId);

    if (error) {
      console.error("[useRoom] Error loading initial hand cards:", error);
      return;
    }
    playerHandCards.value = data ?? [];
  }

  async function enterRoom(
    roomId: string,
    roomCode: string,
    playerId: string,
    initialStatus: string | null,
    onNavigateToGame?: (payload: any) => void,
  ) {
    await joinRoom(roomCode, playerId);
    await insertPlayerInRoomTable(roomId, playerId);
    await setupBroadcastListeners(roomId, playerId, onNavigateToGame);

    gameChannel.value?.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await trackMyPresence();
        if (initialStatus) {
          await trackMyStatus(initialStatus, roomId);
        }
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
        user_name: user.value?.user_metadata?.full_name,
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
    }

    gameChannel.value = supabase.channel(`${roomCode}`, {
      config: { broadcast: { self: true }, presence: { key: playerId } },
    });

    if (!gameChannel.value) {
      console.error("Failed to join game channel.");
      return;
    }
  }

  async function setupBroadcastListeners(
    roomId: string,
    playerId: string,
    onNavigateToGame?: (payload: any) => void,
  ) {
    // Validation
    if (gameChannel.value === null && !user.value) {
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

      console.log("[PRESENCE] Sync - Current players:", players.value);
    });

    gameChannel.value.on(
      "broadcast",
      { event: "lobby_settings_updated" },
      async (payload) => {
        console.log("[BROADCAST] lobby_settings_updated", payload);
        selectedGameMode.value =
          payload?.payload?.selectedGameMode || "classic";
      },
    );

    // navigate_to_game (only register in lobby context)
    if (onNavigateToGame) {
      gameChannel.value.on(
        "broadcast",
        { event: "navigate_to_game" },
        (payload) => {
          console.log("[BROADCAST] navigate_to_game:", payload);
          onNavigateToGame(payload);
        },
      );
    }

    // POSTGRES CHANGES - hand_cards (automatic sync)
    gameChannel.value?.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "hand_cards",
        filter: `user_id=eq.${playerId}`,
      },
      (payload) => {
        console.log("[POSTGRES] hand_cards updated:", payload.eventType);

        if (payload.eventType === "DELETE") {
          // Remove deleted card from local state
          playerHandCards.value = playerHandCards.value.filter(
            (c) => c.id !== payload.old.id,
          );
        } else if (payload.eventType === "INSERT") {
          // Add newly dealt card
          playerHandCards.value = [
            ...playerHandCards.value,
            payload.new as HandCards,
          ];
        } else if (payload.eventType === "UPDATE") {
          // Update existing card
          const index = playerHandCards.value.findIndex(
            (c) => c.id === payload.old.id,
          );
          if (index !== -1) {
            playerHandCards.value[index] = payload.new as HandCards;
          }
        }
      },
    );

    // POSTGRES CHANGES - room_members status updates
    gameChannel.value?.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "room_members",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        // Update player status in local players list
        const playerIndex = players.value.findIndex(
          (p) => p.user_id === payload.new.user_id,
        );
        if (playerIndex !== -1) {
          players.value[playerIndex] = {
            ...players.value[playerIndex],
            status: payload.new.status,
          };
        }
        // Update player score from member data
        updatePlayerScoreFromMember(payload.new);
      },
    );

    // BROADCAST LISTENERS

    // game_initialize
    // ...existing code...
    gameChannel.value.on(
      "broadcast",
      { event: "game_initialize" },
      async (body) => {
        try {
          console.log("[BROADCAST] game_initialize: ", body);
          const setId = body?.payload?.set_id;

          let query = supabase.from("cards").select("*");
          if (Array.isArray(setId)) {
            query = query.in("collection_id", setId as string[]);
          } else if (setId) {
            query = query.eq("collection_id", setId as string);
          }

          const { data: data2, error: error2 } = await query;
          if (error2) {
            console.error("Error fetching collection cards:", error2);
            return;
          }

          collectionCards.value = data2 ?? [];
          console.log(
            "[BROADCAST] loaded collection cards:",
            collectionCards.value.length,
          );
        } catch (err) {
          console.error("[BROADCAST] game_initialize handler error:", err);
        }
      },
    );
    // ...existing code...

    // game_start
    gameChannel.value.on("broadcast", { event: "game_start" }, () => {
      console.log("[BROADCAST] game_start");
      /*       gameStarted.value = true; */
    });

    // round_submitted (fallback refresh)
    gameChannel.value.on(
      "broadcast",
      { event: "round_submitted" },
      async (body) => {
        console.log("[BROADCAST] round_submitted", body);
      },
    );

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
        console.log("[POSTGRES] new room Metadata: ", payload.new.metadata);
        if (gameMasterId.value !== payload.new.owner) {
          gameMasterId.value = payload.new.owner;
        }
        handleGameStateChanges(payload.new.metadata);
      },
    );
  }

  async function leaveRoomRealtime() {
    if (gameChannel.value) {
      const channel = gameChannel.value;
      // Clear state immediately to avoid re-entry
      gameChannel.value = null;

      try {
        await channel.unsubscribe();
        await supabase.removeChannel(channel);
      } catch (error) {
        console.error("[useRoom] Error during channel cleanup:", error);
      }
    }
    // Thorough cleanup as requested
    await supabase.removeAllChannels();
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
    trackMyPresence,
    trackMyStatus,
    setupBroadcastListeners,
    loadInitialHandCards,
    leaveRoomRealtime,
  };
}
