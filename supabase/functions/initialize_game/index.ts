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

    if (!body || !body.room_id) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      set_id = null,
      room_id,
      cardsPerPlayer = null,
      dev2gaps = false,
      mode = "classic",
    } = body;

    // 1. Get room members to determine Czar and deal cards
    const { data: members, error: membersErr } = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", room_id)
      .order("joined_at", { ascending: true });

    if (membersErr) throw membersErr;

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ error: "No members in room" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine first Czar (Round 1)
    const czarId = members[0].user_id;

    const insertPromises: Promise<any>[] = [];

    if (mode !== "creative") {
      // 2. Fetch cards (selecting '*' for black cards to get full data)
      const [
        { data: whiteCards, error: whiteCardsErr },
        { data: blackCards, error: blackCardsErr },
      ] = await Promise.all([
        supabase
          .from("cards")
          .select("id")
          .eq("collection_id", set_id)
          .eq("is_black", false),
        (() => {
          let query = supabase
            .from("cards")
            .select("*")
            .eq("collection_id", set_id)
            .eq("is_black", true);
          if (dev2gaps) query = query.eq("number_of_gaps", 2);
          return query;
        })(),
      ]);

      if (whiteCardsErr || blackCardsErr) throw whiteCardsErr || blackCardsErr;

      // 3. Shuffle White Cards & Build Hand Inserts
      const whitePool = whiteCards
        .map((c) => c.id)
        .sort(() => Math.random() - 0.5);
      const handInserts = [];
      let poolIndex = 0;

      for (const m of members) {
        // TODO: extended mode logic needs 1 less card for every player.
        for (let k = 0; k < cardsPerPlayer; k++) {
          if (poolIndex >= whitePool.length) break;
          handInserts.push({
            user_id: m.user_id,
            card_id: whitePool[poolIndex++],
            room_id,
          });
        }
      }

      insertPromises.push(supabase.from("hand_cards").insert(handInserts));
      // 4. Handle Remaining White Cards
      const remainingWhite = whitePool
        .slice(poolIndex)
        .map((id) => ({ card_id: id, room_id }));
      if (remainingWhite.length > 0) {
        insertPromises.push(
          supabase.from("remaining_white_cards").insert(remainingWhite),
        );
      }

      // 5. Black Card logic
      if (blackCards && blackCards.length > 0) {
        // Shuffle black cards
        const shuffledBlack = [...blackCards].sort(() => Math.random() - 0.5);
        const activeBlackCard = shuffledBlack[0];
        const remainingBlack = shuffledBlack
          .slice(1)
          .map((c) => ({ card_id: c.id, room_id }));

        if (remainingBlack.length > 0) {
          insertPromises.push(
            supabase.from("remaining_black_cards").insert(remainingBlack),
          );
        }
        // Fetch existing metadata first
        const { data: room, error: roomErr } = await supabase
          .from("rooms")
          .select("metadata")
          .eq("id", room_id)
          .single();
        if (roomErr) throw roomErr;

        // Then spread existing metadata and override/add new fields
        insertPromises.push(
          supabase
            .from("rooms")
            .update({
              metadata: {
                ...(room.metadata ?? {}),
                black_card: activeBlackCard,
                czar_id: czarId,
                round_status: "round_start",
                set_id: set_id,
                round: 1,
                handSize: cardsPerPlayer,
                current_winner: null,
                mode: mode,
              },
            })
            .eq("id", room_id),
        );
      }
    } else {
      // Fetch existing metadata first
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", room_id)
        .single();
      if (roomErr) throw roomErr;

      // Then spread existing metadata and override/add new fields
      insertPromises.push(
        supabase
          .from("rooms")
          .update({
            metadata: {
              ...(room.metadata ?? {}),
              black_card: null,
              czar_id: czarId,
              round_status: "round_start",
              set_id: null,
              round: 1,
              handSize: null,
              mode: mode,
              current_winner: null,
              played_black_cards: [],
              played_white_cards: [],
            },
          })
          .eq("id", room_id),
      );
    }

    // Execute all database operations
    const results = await Promise.all(insertPromises);
    for (const { error } of results) if (error) throw error;

    return new Response(JSON.stringify("success"), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
