import { createClient } from "npm:@supabase/supabase-js@2.29.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => null);
    if (!body || !body.room_id || !body.user_id) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { room_id, user_id } = body as {
      room_id: string;
      user_id: string;
    };

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("owner")
      .eq("id", room_id)
      .single();

    if (roomErr) {
      return new Response(
        JSON.stringify({ error: roomErr.message || String(roomErr) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (room?.owner === user_id) {
      const { data: nextPlayers, error: nextPlayersError } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", room_id)
        .neq("user_id", user_id)
        .order("joined_at", { ascending: true })
        .limit(1);

      if (nextPlayersError) {
        return new Response(
          JSON.stringify({ error: nextPlayersError.message || String(nextPlayersError) }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const nextPlayer = nextPlayers?.[0];

      if (nextPlayer) {
        const { error: updateError } = await supabase
          .from("rooms")
          .update({ owner: nextPlayer.user_id })
          .eq("id", room_id);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: updateError.message || String(updateError) }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    const { error: deleteError } = await supabase
      .from("room_members")
      .delete()
      .eq("room_id", room_id)
      .eq("user_id", user_id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: deleteError.message || String(deleteError) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { count, error: countErr } = await supabase
      .from("room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", room_id);

    if (countErr) {
      return new Response(
        JSON.stringify({ error: countErr.message || String(countErr) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let deletedRoom = false;
    if ((count ?? 0) === 0) {
      await supabase.from("hand_cards").delete().eq("room_id", room_id);
      await supabase.from("remaining_white_cards").delete().eq("room_id", room_id);
      await supabase.from("remaining_black_cards").delete().eq("room_id", room_id);
      await supabase.from("room_members").delete().eq("room_id", room_id);
      await supabase.from("rooms").delete().eq("id", room_id);
      deletedRoom = true;
    }

    return new Response(JSON.stringify({ success: true, deleted_room: deletedRoom }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
