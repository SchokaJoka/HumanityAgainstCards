import type { RealtimeChannel } from "@supabase/supabase-js";

export function useRoom() {
  const supabase = useSupabaseClient();
  const gameChannel = ref<RealtimeChannel | null>(null);
  const isLeaving = ref<boolean>(false);
  const roomData = ref({});

  async function getRoomIdByCode(roomCode: string): Promise<string | null> {
    const { data } = await supabase
        .from("rooms")
        .select("id, code, metadata")
        .eq("code", roomCode)
        .maybeSingle();

    if (!data) {
        console.error("Room does not exist.")
        return null;
    }
    console.log("Room data:", data);
    roomData.value = data;
    return data.id;
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
    gameChannel.value = supabase.channel(`${roomCode}`, {
      config: { broadcast: { self: true }, presence: { key: playerId.value } },
    });

    if (!gameChannel.value) {
      authError.value = "Failed to join game channel.";
      return;
    }
  }

  async function leaveRoom(roomId: string, playerId: string) {
    if (!roomId || !playerId) return;

    const { error } = await supabase
      .from("room_members")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", playerId);

    if (error) {
      console.error("Error leaving room:", error);
      return;
    }

    isLeaving.value = true;
    await navigateTo("/");
  }

  return {
    gameChannel,

    isLeaving,
    roomData,

    getRoomIdByCode,
    insertPlayerInRoomTable,
    joinRoom,
    leaveRoom,
  };
}
