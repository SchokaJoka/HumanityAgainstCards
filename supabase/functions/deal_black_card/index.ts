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
    if (!body || !body.room_id || !body.collection_id) {
      return new Response(
        JSON.stringify({ error: "Missing room_id or collection_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { room_id, collection_id } = body;

    // Pull all remaining black cards for this room/collection
    const { data: blackCards, error: blackCardsError } = await supabase
      .from("cards")
      .select("*")
      .eq("collection_id", collection_id)
      .eq("is_black", true);
    if (blackCardsError) throw blackCardsError;

    if (!blackCards || blackCards.length === 0) {
      return new Response(
        JSON.stringify({ error: "No black cards remaining for this room" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Pick a random one
    const pick = blackCards[Math.floor(Math.random() * blackCards.length)];

    // Get room code for the broadcast channel
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("code")
      .eq("id", room_id)
      .single();
    if (roomErr) throw roomErr;

    // Broadcast the new black card to the room channel
    const channel = supabase.channel(room.code);
    /**
     * Sending a message after subscribing will use WebSockets
     */
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") {
        return null;
      }

      channel.send({
        type: "broadcast",
        event: "new_black_card",
        payload: { pick },
      });
    });

    supabase.removeChannel(room.code);

    return new Response(JSON.stringify({ card_id: pick.card_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
