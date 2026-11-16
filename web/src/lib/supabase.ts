import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key);
  return client;
}

// Employee creation must never replace or broadcast over the admin's session.
export function createEmployeeSignupClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `dm-employee-create-${crypto.randomUUID()}` } });
}
export async function requireDirectSignup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  const response = await fetch(`${url}/auth/v1/settings`, { cache: "no-store", headers: { apikey: key } });
  if (!response.ok) throw new Error("Could not check login settings. Try again.");
  const settings = await response.json();
  if (settings.disable_signup || !settings.mailer_autoconfirm) throw new Error("Supabase must allow new signups with Confirm email off before creating employee logins.");
}
