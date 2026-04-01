import { createClient } from "npm:@supabase/supabase-js@2.29.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BlackCardPayload = {
  text: string;
  number_of_gaps: number;
  is_black: true;
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
    if (!body || !body.room_id || !body.czar_id || !body.card) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { room_id, czar_id, card } = body as {
      room_id: string;
      czar_id: string;
      card: BlackCardPayload;
    };

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("metadata")
      .eq("id", room_id)
      .single();
    if (roomErr) throw roomErr;

    const metadata = room?.metadata ?? {};
    const mode = metadata.mode ?? "classic";
    if (mode !== "creative") {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (metadata.czar_id && metadata.czar_id !== czar_id) {
      return new Response(JSON.stringify({ error: "Only czar can submit" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const playedBlack = (metadata.played_black_cards ??
      []) as BlackCardPayload[];
    const updatedMetadata = {
      ...metadata,
      black_card: card,
      round_status: "round_start",
      played_black_cards: [...playedBlack, card],
    };

    const { error: updateErr } = await supabase
      .from("rooms")
      .update({ metadata: updatedMetadata })
      .eq("id", room_id);
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ success: true }), {
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
