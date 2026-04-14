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

    const {
      room_id,
      user_id,
      user_name = null,
      avatar_url = null,
    } = body as {
      room_id: string;
      user_id: string;
      user_name?: string | null;
      avatar_url?: string | null;
    };

    const { data: existingMember, error: memberErr } = await supabase
      .from("room_members")
      .select("*")
      .eq("room_id", room_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (memberErr && memberErr.code !== "PGRST116") {
      return new Response(
        JSON.stringify({ error: memberErr.message || String(memberErr) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (existingMember?.user_id) {
      const { error: updateErr } = await supabase
        .from("room_members")
        .update({
          is_active: true,
          left_at: null,
          user_name,
          metadata: {
            ...existingMember.metadata,
            avatar_url: avatar_url
          },
        })
        .eq("room_id", room_id)
        .eq("user_id", user_id);

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: updateErr.message || String(updateErr) }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ success: true, rejoined: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("metadata")
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

    const roundStatus = room?.metadata?.round_status ?? "lobby";
    if (roundStatus !== "lobby") {
      return new Response(
        JSON.stringify({ error: "Room is already in a game." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: insertErr } = await supabase.from("room_members").insert({
      room_id,
      user_id,
      role: "player",
      is_active: true,
      left_at: null,
      user_name,
      joined_at: new Date().toISOString(),
      status: "waiting",
      metadata: { submitted_cards: [], avatar_url: avatar_url },
    });

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: insertErr.message || String(insertErr) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
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
