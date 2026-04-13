import { createClient } from "npm:@supabase/supabase-js@2.29.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

console.info("server started");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => null);

  if (!body || !body.room_id) {
    return new Response(JSON.stringify({ error: "Missing parameters" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { room_id } = body;

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("metadata")
    .eq("id", room_id)
    .single();

  if (roomErr) {
    return new Response(
      JSON.stringify({ error: roomErr.message || roomErr }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const metadata = (room?.metadata ?? {}) as Record<string, any>;
  const resetMetadata = {
    ...metadata,
    round_status: "lobby",
    black_card: null,
    czar_id: null,
    current_winner: null,
    round: null,
    handSize: null,
    set_id: null,
    played_black_cards: [],
    played_white_cards: [],
    submitted_white_cards: [],
  };

  const { error: updateErr } = await supabase
    .from("rooms")
    .update({ metadata: resetMetadata })
    .eq("id", room_id);

  if (updateErr) {
    return new Response(
      JSON.stringify({ error: updateErr.message || updateErr }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const cleanupResults = await Promise.all([
    supabase.from("hand_cards").delete().eq("room_id", room_id),
    supabase.from("remaining_white_cards").delete().eq("room_id", room_id),
    supabase.from("remaining_black_cards").delete().eq("room_id", room_id),
    supabase
      .from("room_members")
      .update({
        status: "waiting",
        points: 0,
        metadata: { submitted_cards: [] },
      })
      .eq("room_id", room_id),
  ]);

  for (const result of cleanupResults) {
    if (result.error) {
      return new Response(
        JSON.stringify({ error: result.error.message || result.error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
