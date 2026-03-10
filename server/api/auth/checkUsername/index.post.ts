import { serverSupabaseServiceRole } from '#supabase/server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';

  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Missing username' });
  }

  const supabase = serverSupabaseServiceRole(event);

  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('username', username);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { isUsernameUsed: (count ?? 0) > 0 };
});
