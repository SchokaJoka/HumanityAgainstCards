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
    const { room_id } = body;

    // Fetch existing room metadata
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("metadata")
      .eq("id", room_id)
      .single();
    if (roomErr) throw roomErr;
    if (room.metadata?.round == null) throw new Error("round is null");

    const round: number = room.metadata.round;
    const mode = room.metadata?.mode ?? "classic";

    // 1. Get all room members
    const { data: members, error: membersErr } = await supabase
      .from("room_members")
      .select("user_id, metadata, status")
      .eq("room_id", room_id)
      .order("joined_at", { ascending: true });

    if (membersErr) throw membersErr;
    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ error: "No members in room" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newCzarId = members[round % members.length].user_id;

    if (mode === "creative") {
      const memberResetPromises = members.map((m) =>
        supabase
          .from("room_members")
          .update({
            status: "waiting",
            metadata: {
              ...(m.metadata ?? {}),
              submitted_cards: [],
            },
          })
          .eq("user_id", m.user_id)
          .eq("room_id", room_id),
      );
      const resetResults = await Promise.all(memberResetPromises);
      for (const { error } of resetResults) if (error) throw error;

      const { error: roomUpdateErr } = await supabase
        .from("rooms")
        .update({
          metadata: {
            ...(room.metadata ?? {}),
            black_card: null,
            czar_id: newCzarId,
            round_status: "round_start",
            round: round + 1,
            current_winner: null,
            submitted_white_cards: [],
          },
        })
        .eq("id", room_id);
      if (roomUpdateErr) throw roomUpdateErr;

      return new Response(JSON.stringify("success"), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Ensure remaining_black_cards has cards; if empty, refill from set(s)
    const { count: blackRemainingCount, error: blackRemainingCountErr } =
      await supabase
        .from("remaining_black_cards")
        .select("card_id", { count: "exact" })
        .eq("room_id", room_id);
    if (blackRemainingCountErr) throw blackRemainingCountErr;

    if ((blackRemainingCount ?? 0) < 1) {
      // Fetch all black cards for the room's set(s)
      const setId = room.metadata?.set_id;
      let blackQuery = supabase.from("cards").select("id").eq("is_black", true);
      if (Array.isArray(setId)) {
        blackQuery = blackQuery.in("collection_id", setId as string[]);
      } else if (setId) {
        blackQuery = blackQuery.eq("collection_id", setId as string);
      }
      const { data: allBlackCards, error: allBlackErr } = await blackQuery;
      if (allBlackErr) throw allBlackErr;
      const blackIds = (allBlackCards ?? []).map((c: any) => c.id);

      // Shuffle and insert into remaining_black_cards
      for (let i = blackIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [blackIds[i], blackIds[j]] = [blackIds[j], blackIds[i]];
      }

      if (blackIds.length > 0) {
        const rows = blackIds.map((card_id: string) => ({ card_id, room_id }));
        const { error: insertBlackErr } = await supabase
          .from("remaining_black_cards")
          .insert(rows);
        if (insertBlackErr) throw insertBlackErr;
      }
    }

    // Draw and assign new black card
    const { data: newBlackCard, error: blackFetchErr } = await supabase
      .from("remaining_black_cards")
      .select("*")
      .eq("room_id", room_id)
      .limit(1)
      .single();
    if (blackFetchErr) throw blackFetchErr;
    if (!newBlackCard) throw new Error("Couldn't find Black Card");

    const { data: blackCardData, error: blackCardDataErr } = await supabase
      .from("cards")
      .select("*")
      .eq("id", newBlackCard.card_id)
      .single();
    if (blackCardDataErr) throw blackCardDataErr;
    if (!blackCardData) throw new Error("Couldn't find card data");

    const { error: deleteBlackErr } = await supabase
      .from("remaining_black_cards")
      .delete()
      .eq("id", newBlackCard.id);
    if (deleteBlackErr) throw deleteBlackErr;

    // 3. Deal replacement white cards to each non-czar player
    //    Each player gets as many cards as they submitted last round
    //    (i.e. however many are missing from a full hand of 7)
    const handSize: number = room.metadata?.handSize;
    if (!handSize) throw new Error("handSize not set in room metadata");
    const nonCzarMembers = members.filter(
      (m) => m.user_id !== room.metadata.czar_id,
    );

    // Fetch current hand sizes for all non-czar players in one query
    const { data: allHandCards, error: handErr } = await supabase
      .from("hand_cards")
      .select("user_id, card_id")
      .eq("room_id", room_id)
      .in(
        "user_id",
        nonCzarMembers.map((m) => m.user_id),
      );
    if (handErr) throw handErr;

    // Calculate how many cards each player needs
    const handCountByUser: Record<string, number> = {};
    for (const row of allHandCards ?? []) {
      handCountByUser[row.user_id] = (handCountByUser[row.user_id] ?? 0) + 1;
    }

    const cardNeeds = nonCzarMembers
      .map((m) => ({
        user_id: m.user_id,
        needed: handSize - (handCountByUser[m.user_id] ?? 0),
      }))
      .filter((m) => m.needed > 0);

    const totalNeeded = cardNeeds.reduce((sum, m) => sum + m.needed, 0);

    // Draw enough white cards from the pool in one query
    if (totalNeeded > 0) {
      // Ensure enough cards in the remaining pool — if not, rebuild pool from collection(s)
      const { count: remainingCount, error: remainingCountErr } = await supabase
        .from("remaining_white_cards")
        .select("card_id", { count: "exact" })
        .eq("room_id", room_id);
      if (remainingCountErr) throw remainingCountErr;

      // If remaining pool is insufficient, rebuild it from collection(s) minus current hand cards
      if ((remainingCount ?? 0) < totalNeeded) {
        // Determine collection(s) used by this room
        const setId = room.metadata?.set_id;

        // Fetch all white card ids from the collection(s)
        let cardsQuery = supabase
          .from("cards")
          .select("id")
          .eq("is_black", false);
        if (Array.isArray(setId)) {
          cardsQuery = cardsQuery.in("collection_id", setId as string[]);
        } else if (setId) {
          cardsQuery = cardsQuery.eq("collection_id", setId as string);
        }
        const { data: allCards, error: allCardsErr } = await cardsQuery;
        if (allCardsErr) throw allCardsErr;
        const allCardIds = (allCards ?? []).map((c: any) => c.id);

        // Fetch all current hand card ids in the room to keep ownership
        const { data: currentHands, error: currentHandsErr } = await supabase
          .from("hand_cards")
          .select("card_id")
          .eq("room_id", room_id);
        if (currentHandsErr) throw currentHandsErr;
        const currentHandIds = new Set(
          (currentHands ?? []).map((r: any) => r.card_id),
        );

        // Prefer to refill from discard (played/submitted). Exclude cards currently in hands.
        const playedIds = new Set(
          (room.metadata?.played_white_cards as string[]) ?? [],
        );
        const submittedIds = new Set(
          (room.metadata?.submitted_white_cards as string[]) ?? [],
        );
        const usedIds = new Set<string>([...playedIds, ...submittedIds]);

        let refillIds: string[] = [];
        if (usedIds.size > 0) {
          refillIds = Array.from(usedIds).filter(
            (id: string) => !currentHandIds.has(id),
          );
        } else {
          // Fallback: use all collection cards minus current hands
          refillIds = allCardIds.filter(
            (id: string) => !currentHandIds.has(id),
          );
        }

        // Shuffle refill deck
        for (let i = refillIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [refillIds[i], refillIds[j]] = [refillIds[j], refillIds[i]];
        }

        // Replace remaining_white_cards for room with refillIds
        if (refillIds.length > 0) {
          const { error: clearErr } = await supabase
            .from("remaining_white_cards")
            .delete()
            .eq("room_id", room_id);
          if (clearErr) throw clearErr;

          const refillRows = refillIds.map((card_id: string) => ({
            card_id,
            room_id,
          }));
          const { error: insertRefillErr } = await supabase
            .from("remaining_white_cards")
            .insert(refillRows);
          if (insertRefillErr) throw insertRefillErr;
        }
      }

      // Now draw from the (possibly rebuilt) pool
      const { data: poolCards, error: poolErr } = await supabase
        .from("remaining_white_cards")
        .select("card_id")
        .eq("room_id", room_id);
      if (poolErr) throw poolErr;

      // Build a local pool, shuffle, and take only what's needed to avoid DB ordering issues
      let pool = (poolCards ?? []).map((c) => c.card_id);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool = pool.slice(0, totalNeeded);

      if (pool.length > 0) {
        // Remove drawn cards from pool immediately
        const { error: removePoolErr } = await supabase
          .from("remaining_white_cards")
          .delete()
          .eq("room_id", room_id)
          .in("card_id", pool);
        if (removePoolErr) throw removePoolErr;

        // Before inserting new hand assignments, clear any previous ownership for these card_ids in this room
        const { error: deletePrevErr } = await supabase
          .from("hand_cards")
          .delete()
          .eq("room_id", room_id)
          .in("card_id", pool);
        if (deletePrevErr) throw deletePrevErr;

        // Slice pool per player and build hand_cards insert rows
        let cursor = 0;
        const handInserts: {
          user_id: string;
          card_id: string;
          room_id: string;
        }[] = [];

        for (const { user_id, needed } of cardNeeds) {
          const slice = pool.slice(cursor, cursor + needed);
          cursor += needed;
          for (const card_id of slice) {
            handInserts.push({ user_id, card_id, room_id });
          }
        }

        const { error: insertHandErr } = await supabase
          .from("hand_cards")
          .insert(handInserts);
        if (insertHandErr) throw insertHandErr;
      }
    }

    // 4. Reset all member statuses to "waiting" and clear submitted_cards from metadata
    const memberResetPromises = members.map((m) =>
      supabase
        .from("room_members")
        .update({
          status: "waiting",
          metadata: {
            ...(m.metadata ?? {}),
            submitted_cards: [],
          },
        })
        .eq("user_id", m.user_id)
        .eq("room_id", room_id),
    );
    const resetResults = await Promise.all(memberResetPromises);
    for (const { error } of resetResults) if (error) throw error;

    // 5. Update room metadata for the new round
    const { error: roomUpdateErr } = await supabase
      .from("rooms")
      .update({
        metadata: {
          ...(room.metadata ?? {}),
          black_card: blackCardData,
          czar_id: newCzarId,
          round_status: "round_start",
          round: round + 1,
          current_winner: null,
        },
      })
      .eq("id", room_id);
    if (roomUpdateErr) throw roomUpdateErr;

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
