/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

const URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = (URL && KEY) ? createClient(URL, KEY) : null;

// Simple anonymous user ID — stored in localStorage
export function getUserId(): string {
  let id = localStorage.getItem("ft_uid");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("ft_uid", id); }
  return id;
}

// ── Sync all data to Supabase ─────────────────────────────────────────────────
export async function syncToCloud(data: object): Promise<void> {
  if (!supabase) return;
  const user_id = getUserId();
  await supabase.from("ft_data").upsert({ id: user_id, user_id, data, updated_at: new Date().toISOString() });
}

// ── Load data from Supabase ───────────────────────────────────────────────────
export async function loadFromCloud(): Promise<object | null> {
  if (!supabase) return null;
  const user_id = getUserId();
  const { data, error } = await supabase.from("ft_data").select("data").eq("id", user_id).single();
  if (error || !data) return null;
  return data.data;
}
