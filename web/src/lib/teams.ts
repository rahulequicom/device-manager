"use client";
import useSWR from "swr";
import { teams as defaults } from "./device-data";
import { getSupabase } from "./supabase";
import { isLocalInventory } from "./local-register";

async function loadTeams(): Promise<string[]> {
  if (isLocalInventory()) return [...defaults];
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const names: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("dm_teams").select("name").neq("name", "Unassigned").order("name").range(offset, offset + 499);
    if (error) throw error;
    names.push(...data.map(row => row.name as string));
    if (data.length < 500) return names;
  }
}
export function useTeams() {
  const result = useSWR("teams", loadTeams, { refreshInterval: 30000 });
  return { ...result, teams: result.data?.length ? result.data : [...defaults] };
}
export async function saveTeam(name: string, previousName: string | null) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.rpc("dm_admin_save_team", { p_name: name.trim(), p_previous_name: previousName });
  if (error) throw error;
  return data as string;
}
