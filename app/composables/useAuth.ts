/* login with email and password (supabase) and create log out function. */

const supabase = useSupabaseClient();

async function signUpNewUser() {
  const { data, error } = await supabase.auth.signUp({
    email: "valid.email@supabase.io",
    password: "example-password",
    options: {
      emailRedirectTo: "https://example.com/welcome",
    },
  });
}

async function signInWithEmail() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "valid.email@supabase.io",
    password: "example-password",
  });
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
}
export { signUpNewUser, signInWithEmail, signOut };
