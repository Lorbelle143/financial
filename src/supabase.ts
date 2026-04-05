/// <reference types="vite/client" />
import { createClient, type User, type Session } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = (URL && KEY) ? createClient(URL, KEY) : null;

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function signUp(email: string, password: string) {
  if (!supabase) return { error: { message: "Supabase not configured" } };
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  if (!supabase) return { error: { message: "Supabase not configured" } };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInWithGoogle() {
  if (!supabase) return { error: { message: "Supabase not configured" } };
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function onAuthChange(cb: (user: User | null) => void) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
}

// ── Cloud Sync ────────────────────────────────────────────────────────────────
export async function syncToCloud(data: object): Promise<void> {
  if (!supabase) return;
  const user = await getUser();
  if (!user) return;
  await supabase.from("ft_data").upsert({
    id: user.id,
    data,
    updated_at: new Date().toISOString()
  });
}

export async function loadFromCloud(): Promise<object | null> {
  if (!supabase) return null;
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("ft_data")
    .select("data")
    .eq("id", user.id)
    .single();
  if (error || !data) return null;
  return data.data;
}
