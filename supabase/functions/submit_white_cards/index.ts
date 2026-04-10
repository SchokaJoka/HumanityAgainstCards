import { createClient } from "npm:@supabase/supabase-js@2.29.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SubmittedCard {
  card_id: string;
  [key: string]: unknown;
}

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
    if (
      !body ||
      !body.czar_id ||
      !body.user_id ||
      !body.room_id ||
      !Array.isArray(body.submitted_cards) ||
      body.submitted_cards.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { czar_id, user_id, room_id, submitted_cards } = body;

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("metadata")
      .eq("id", room_id)
      .single();

    if (roomError) throw roomError;

    const mode = roomData.metadata.mode;

    if (mode === undefined || mode === null)
      throw new Error("mode not defined in room Metadata");

    if (mode !== "creative") {
      const submittedCardIds = submitted_cards.map(
        (c: SubmittedCard) => c.card_id,
      );

      // --- Step 1: Verify the user actually holds these cards in hand_cards ---
      const { data: handCards, error: handError } = await supabase
        .from("hand_cards")
        .select("card_id")
        .eq("user_id", user_id)
        .in("card_id", submittedCardIds);
      if (handError) throw handError;

      const ownedCardIds = new Set(
        (handCards ?? []).map((c: { card_id: string }) => c.card_id),
      );
      const allOwned = submittedCardIds.every((id: string) =>
        ownedCardIds.has(id),
      );

      if (!allOwned) {
        return new Response(
          JSON.stringify({ error: "User does not own all submitted cards" }),
          {
            // Return 200 so client receives structured error payload instead of a FunctionsHttpError
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // --- Step 2: Update room_members — merge submitted card IDs into metadata, set status = "submitted" ---
      const { data: memberRow, error: memberFetchError } = await supabase
        .from("room_members")
        .select("metadata")
        .eq("user_id", user_id)
        .eq("room_id", room_id)
        .single();
      if (memberFetchError) throw memberFetchError;

      const updatedMetadata = {
        ...(memberRow?.metadata ?? {}),
        submitted_cards: submittedCardIds,
      };

      const { error: memberUpdateError } = await supabase
        .from("room_members")
        .update({ metadata: updatedMetadata, status: "submitted" })
        .eq("user_id", user_id)
        .eq("room_id", room_id);
      if (memberUpdateError) throw memberUpdateError;

      // --- Step 3: Delete submitted cards from hand_cards ---
      const { error: deleteError } = await supabase
        .from("hand_cards")
        .delete()
        .eq("user_id", user_id)
        .in("card_id", submittedCardIds);
      if (deleteError) throw deleteError;

      // --- Step 4: Append submitted cards to room metadata played/submitted lists (deduplicated)
      const { data: roomRow, error: roomRowErr } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", room_id)
        .single();
      if (roomRowErr) throw roomRowErr;

      const existingSubmitted =
        (roomRow?.metadata?.submitted_white_cards as string[]) ?? [];
      const existingPlayed =
        (roomRow?.metadata?.played_white_cards as string[]) ?? [];

      const nextSubmitted = Array.from(
        new Set(existingSubmitted.concat(submittedCardIds)),
      );
      const nextPlayed = Array.from(
        new Set(existingPlayed.concat(submittedCardIds)),
      );

      const { error: roomUpdateErr } = await supabase
        .from("rooms")
        .update({
          metadata: {
            ...(roomRow?.metadata ?? {}),
            submitted_white_cards: nextSubmitted,
            played_white_cards: nextPlayed,
          },
        })
        .eq("id", room_id);
      if (roomUpdateErr) throw roomUpdateErr;
    } else {
      // --- Step 2: Update room_members — merge submitted card IDs into metadata, set status = "submitted" ---
      const { data: memberRow, error: memberFetchError } = await supabase
        .from("room_members")
        .select("metadata")
        .eq("user_id", user_id)
        .eq("room_id", room_id)
        .single();
      if (memberFetchError) throw memberFetchError;

      const updatedMetadata = {
        ...(memberRow?.metadata ?? {}),
        submitted_cards: submitted_cards,
      };

      const { error: memberUpdateError } = await supabase
        .from("room_members")
        .update({ metadata: updatedMetadata, status: "submitted" })
        .eq("user_id", user_id)
        .eq("room_id", room_id);
      if (memberUpdateError) throw memberUpdateError;

      const existingSubmitted =
        (roomData?.metadata?.submitted_white_cards as string[]) ?? [];
      const existingPlayed =
        (roomData?.metadata?.played_white_cards as string[]) ?? [];

      const nextSubmitted = existingSubmitted.concat(submitted_cards);
      const nextPlayed = existingPlayed.concat(submitted_cards);

      const { error: roomUpdateError } = await supabase
        .from("rooms")
        .update({
          metadata: {
            ...(roomData?.metadata ?? {}),
            submitted_white_cards: nextSubmitted,
            played_white_cards: nextPlayed,
          },
        })
        .eq("id", room_id);
      if (roomUpdateError) throw roomUpdateError;
    }

    // --- Step 4: Check if ALL non-czar players in the room have status "submitted" ---
    const { data: allMembers, error: allMembersError } = await supabase
      .from("room_members")
      .select("user_id, status")
      .eq("room_id", room_id)
      .neq("user_id", czar_id);
    if (allMembersError) throw allMembersError;

    const allSubmitted =
      allMembers &&
      allMembers.length > 0 &&
      allMembers.every((m: { user_id: string; status: string }) =>
        m.user_id === user_id ? true : m.status === "submitted",
      );

    // --- Step 5: If all submitted, update room metadata round_status ---
    if (allSubmitted) {
      const { data: roomRow, error: roomFetchError } = await supabase
        .from("rooms")
        .select("metadata")
        .eq("id", room_id)
        .single();
      if (roomFetchError) throw roomFetchError;

      const updatedRoomMetadata = {
        ...(roomRow?.metadata ?? {}),
        round_status: "round_submitted",
      };

      const { error: roomUpdateError } = await supabase
        .from("rooms")
        .update({ metadata: updatedRoomMetadata })
        .eq("id", room_id);
      if (roomUpdateError) throw roomUpdateError;
    }

    return new Response(
      JSON.stringify({ success: true, all_submitted: allSubmitted ?? false }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
