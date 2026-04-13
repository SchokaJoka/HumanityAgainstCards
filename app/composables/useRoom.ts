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
  const isRoomNavigation = useState<boolean>("isRoomNavigation", () => false);
  const hasBoundRoomListeners = useState<boolean>(
    "hasBoundRoomListeners",
    () => false,
  );

  const gameMasterId = useState<string>("gameMasterId", () => "");
  const { updatePlayerScoreFromMember } = usePlayerScores();
  const { handleGameStateChanges } = useGameManager();

  const isLeaving = ref<boolean>(false);
  const players = useState<any[]>("players", () => []);
  const presenceByUserId = useState<Record<string, boolean>>(
    "presenceByUserId",
    () => ({}),
  );
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
      const { data, error } = await supabase.functions.invoke("leave_room", {
        method: "POST",
        body: {
          room_id: roomId,
          user_id: playerId,
        },
      });

      if (error) {
        console.error("Error leaving room:", error);
        return;
      }

      if ((data as any)?.error) {
        console.error("Error leaving room (edge):", (data as any).error);
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

  async function resetPlayerList() {
    players.value = [];
  }

  function mergePresenceIntoPlayers() {
    const presence = presenceByUserId.value ?? {};
    players.value = players.value.map((player: any) => ({
      ...player,
      is_online: !!presence[player.user_id],
    }));
  }

  async function refreshRoomMembers(roomId: string) {
    const { data, error } = await supabase
      .from("room_members")
      .select("user_id,user_name,status,points,metadata,joined_at,is_active")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("[useRoom] Error loading room_members:", error);
      return;
    }

    const presence = presenceByUserId.value ?? {};
    players.value = (data ?? []).map((member: any) => ({
      ...member,
      is_online: !!presence[member.user_id],
    }));
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
  ): Promise<boolean> {
    await joinRoom(roomCode, playerId);
    const joined = await insertPlayerInRoomTable(roomId, playerId);
    if (!joined) {
      await leaveRoomRealtime();
      return false;
    }
    await setupBroadcastListeners(roomId, playerId);

    if (gameChannel.value) {
      const state = (gameChannel.value as any).state;
      if (state !== "joined" && state !== "joining") {
        gameChannel.value.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await trackMyPresence();
          }
        });
      }
    }

    const isJoined = await ensureChannelSubscribed();
    if (!isJoined) {
      console.warn("[useRoom] Channel did not reach SUBSCRIBED state.");
    }

    return true;
  }

  async function insertPlayerInRoomTable(
    roomId: string,
    playerId: string,
  ): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke("join_room", {
      method: "POST",
      body: {
        room_id: roomId,
        user_id: playerId,
        user_name: user.value?.user_metadata?.full_name ?? null,
      },
    });

    if (error) {
      console.error("Error joining room:", error);
      return false;
    }

    if ((data as any)?.error) {
      console.error("Error joining room (edge):", (data as any).error);
      return false;
    }

    return true;
  }

  async function joinRoom(roomCode: string, playerId: string) {
    // Reuse existing channel only when it targets the same room and is healthy
    if (gameChannel.value && (gameChannel.value as any).topic === roomCode) {
      const state = (gameChannel.value as any).state;
      if (state === "joined" || state === "joining") {
        return;
      }

      try {
        const stale = gameChannel.value;
        await stale.unsubscribe();
        await supabase.removeChannel(stale);
      } catch (err) {
        console.error("[useRoom] Error removing stale room channel:", err);
      }
      gameChannel.value = null;
      hasBoundRoomListeners.value = false;
    }

    // If we have a different channel, clean it up
    if (gameChannel.value) {
      try {
        const old = gameChannel.value;
        await old.unsubscribe();
        await supabase.removeChannel(old);
      } catch (err) {
        console.error("[useRoom] Error removing existing channel:", err);
      }
      gameChannel.value = null;
      hasBoundRoomListeners.value = false;
    }

    // Create a new channel for this room (topic must match server broadcasts)
    gameChannel.value = supabase.channel(roomCode, {
      config: { broadcast: { self: true }, presence: { key: playerId } },
    });

    if (!gameChannel.value) {
      console.error("Failed to join game channel.");
      return;
    }

    hasBoundRoomListeners.value = false;
  }

  async function ensureChannelSubscribed(): Promise<boolean> {
    if (!gameChannel.value) {
      console.error("[useRoom] No game channel to subscribe to.");
      return false;
    }

    const state = (gameChannel.value as any).state;
    if (state === "joined") {
      await trackMyPresence();
      return true;
    }

    const timeoutMs = 5000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const currentState = (gameChannel.value as any)?.state;
      if (currentState === "joined") return true;
      if (currentState === "closed" || currentState === "errored") {
        console.error("Channel subscription failed with state:", currentState);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return (gameChannel.value as any)?.state === "joined";
  }

  async function setupBroadcastListeners(roomId: string, playerId: string) {
    // Validation
    const channel = gameChannel.value;
    if (!channel || !user.value) {
      console.error("[useRoom.ts] Game channel or user not initialized.");
      return;
    }

    if (hasBoundRoomListeners.value) {
      await refreshRoomMembers(roomId);
      return;
    }

    // PRESENCE SYNC
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() ?? {};
      const nextPresence: Record<string, boolean> = {};

      Object.values(state).forEach((arr: any) => {
        const entry = arr?.[0];
        if (entry?.user_id) {
          nextPresence[entry.user_id] = true;
        }
      });

      presenceByUserId.value = nextPresence;
      mergePresenceIntoPlayers();
    });

    channel.on(
      "broadcast",
      { event: "lobby_settings_updated" },
      async (payload) => {
        console.log("[BROADCAST] lobby_settings_updated", payload);
        selectedGameMode.value =
          payload?.payload?.selectedGameMode || "classic";
      },
    );

    // navigate_to_game (only register in lobby context)
    channel.on("broadcast", { event: "navigate_to_game" }, (payload) => {
      console.log("[BROADCAST] navigate_to_game:", payload);
      isRoomNavigation.value = true;
      const mode = payload?.payload?.mode ?? "classic";
      navigateTo(`/play/${payload.payload.roomCode}/game/${mode}`);
    });

    // POSTGRES CHANGES - hand_cards (automatic sync)
    channel.on(
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

    // POSTGRES CHANGES - room_members updates
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_members",
        filter: `room_id=eq.${roomId}`,
      },
      async (payload) => {
        if (payload.eventType === "UPDATE") {
          updatePlayerScoreFromMember(payload.new);
        }
        await refreshRoomMembers(roomId);
      },
    );

    // BROADCAST LISTENERS

    // game_initialize
    // ...existing code...
    channel.on("broadcast", { event: "game_initialize" }, async (body) => {
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
    });

    // game_start
    channel.on("broadcast", { event: "game_start" }, () => {
      console.log("[BROADCAST] game_start");
      /*       gameStarted.value = true;
       */
    });

    // round_submitted (fallback refresh)
    channel.on("broadcast", { event: "round_submitted" }, async (body) => {
      console.log("[BROADCAST] round_submitted", body);
    });

    // Realtime table listeners (after channel is created)
    channel.on(
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
        const nextMode = payload.new.metadata?.mode;
        if (nextMode === "classic" || nextMode === "creative") {
          selectedGameMode.value = nextMode;
        }
        handleGameStateChanges(payload.new.metadata);
      },
    );

    await refreshRoomMembers(roomId);

    hasBoundRoomListeners.value = true;
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
    hasBoundRoomListeners.value = false;
    presenceByUserId.value = {};
    isRoomNavigation.value = false;
    // Thorough cleanup as requested
    await supabase.removeAllChannels();
  }

  async function setRoomRoundStatus(roomId: string, status: string) {
    if (!roomId) return;
    try {
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", roomId)
        .single();

      if (roomErr) {
        console.error("[useRoom] Couldn't load room metadata:", roomErr);
        return;
      }

      const metadata = (room?.metadata ?? {}) as Record<string, any>;
      const { error: updateErr } = await supabase
        .from("rooms")
        .update({ metadata: { ...(metadata ?? {}), round_status: status } })
        .eq("id", roomId);

      if (updateErr)
        console.error("[useRoom] Error updating round_status:", updateErr);
    } catch (err) {
      console.error("[useRoom] setRoomRoundStatus error:", err);
    }
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
    setupBroadcastListeners,
    ensureChannelSubscribed,
    loadInitialHandCards,
    leaveRoomRealtime,
    setRoomRoundStatus,
  };
}
