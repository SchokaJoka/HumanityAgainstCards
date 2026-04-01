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
    if (!body || !body.room_id || body.round === undefined) {
      return new Response(
        JSON.stringify({ error: "Missing room_id or round" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { room_id, round } = body;

    // Get room members
    const { data: members, error: membersErr } = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", room_id)
      .order("created_at", { ascending: true });
    if (membersErr) throw membersErr;
    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ error: "No members in room" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine czar using (round - 1) % members.length
    const czarIndex = (round - 1) % members.length;
    const czarId = members[czarIndex].user_id;

    // Get a random black card from remaining_black_cards
    const { data: blackCards, error: blackCardsErr } = await supabase
      .from("remaining_black_cards")
      .select("*")
      .eq("room_id", room_id);
    if (blackCardsErr) throw blackCardsErr;
    if (!blackCards || blackCards.length === 0) {
      return new Response(
        JSON.stringify({ error: "No black cards remaining" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const randomIndex = Math.floor(Math.random() * blackCards.length);
    const chosenBlackCard = blackCards[randomIndex];

    // Delete the chosen card from remaining_black_cards
    const { error: deleteErr } = await supabase
      .from("remaining_black_cards")
      .delete()
      .eq("id", chosenBlackCard.id);
    if (deleteErr) throw deleteErr;

    // Fetch full card info
    const { data: cardInfo, error: cardInfoErr } = await supabase
      .from("cards")
      .select("*")
      .eq("id", chosenBlackCard.card_id)
      .single();
    if (cardInfoErr) throw cardInfoErr;

    // Update room metadata with current black card
    const { error: metadataErr } = await supabase
      .from("rooms")
      .update({
        metadata: {
          black_card: cardInfo,
          czar_id: czarId,
          gameState: "round_start",
        },
      })
      .eq("id", room_id);
    if (metadataErr) throw metadataErr;

    return new Response(JSON.stringify("success"), {
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
