import { createClient } from 'npm:@supabase/supabase-js@2.29.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => null);
    if (!body || !body.room_id || !body.winner) {
      return new Response(JSON.stringify({ error: 'Missing room_id or winner_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { room_id, winner } = body;

    // Increment winner's points in room_members
    const { data: member, error: fetchError } = await supabase
      .from('room_members')
      .select('points')
      .eq('room_id', room_id)
      .eq('user_id', winner.user_id)
      .single();
    if (fetchError) throw fetchError;

    const { error: updatePointsError } = await supabase
      .from('room_members')
      .update({ points: (member.points ?? 0) + 1 })
      .eq('room_id', room_id)
      .eq('user_id', winner.user_id);
    if (updatePointsError) throw updatePointsError;

    // Update room metadata: set round_status to "round_end"
    const { data: room, error: roomFetchError } = await supabase
      .from('rooms')
      .select('metadata')
      .eq('id', room_id)
      .single();
    if (roomFetchError) throw roomFetchError;

    const { error: roomUpdateError } = await supabase
      .from('rooms')
      .update({ metadata: { ...(room.metadata ?? {}), round_status: 'round_end', current_winner: winner } })
      .eq('id', room_id);
    if (roomUpdateError) throw roomUpdateError;

    return new Response(JSON.stringify("success"), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});