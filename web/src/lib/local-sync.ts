import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, Device } from "./device-data";
import { pendingLocalChanges, acknowledgeLocalChanges } from "./local-register";

const editable = ["name", "model_name", "model_number", "serial_number", "ios_version", "platform", "capacity", "wifi_address", "bluetooth_address", "barcode", "ram", "allocation_team", "availability_confirmed", "holder_id", "retired"] as const;

// Compare only locally edited fields. Never upload the seed or local version counters.
export function planLocalSync(events: AuditEvent[], remote: Device) {
  const relevant = events.filter(event => event.device_id === remote.id);
  const first = relevant[0]?.before_data as Partial<Device> | undefined;
  const last = relevant[relevant.length - 1]?.after_data as Partial<Device> | undefined;
  if (relevant[0]?.before_data === null && last) {
    if (editable.some(field => (remote[field] ?? null) !== (last[field] ?? null))) throw new Error(`Sync conflict for ${remote.name}: the newly registered device differs in Supabase.`);
    return {};
  }
  if (!first || !last) throw new Error(`Missing local change history for ${remote.name}.`);
  const patch: Partial<Device> = {};
  for (const field of editable) {
    if (!(field in first) || !(field in last)) throw new Error(`Incomplete local change history for ${remote.name}.`);
    if ((first[field] ?? null) === (last[field] ?? null)) continue;
    if ((remote[field] ?? null) === (last[field] ?? null)) continue;
    if ((remote[field] ?? null) !== (first[field] ?? null)) throw new Error(`Sync conflict for ${remote.name}: ${field} changed in Supabase. Local edits are retained.`);
    Object.assign(patch, { [field]: last[field] });
  }
  return patch;
}

export async function syncLocalInventory(client: SupabaseClient) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to sync your local changes.");
  const { data: admin, error: adminError } = await client.from("dm_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (adminError) throw adminError;
  if (!admin) throw new Error("This account needs membership in dm_admins before it can sync.");
  const { members, events } = pendingLocalChanges();
  for (const member of members) {
    const existing = await client.from("dm_members").select("id,name,team,role").eq("id", member.id).maybeSingle();
    if (existing.error) throw existing.error;
    const storedMember = existing.data;
    if (storedMember) {
      if (["name", "team", "role"].some(field => storedMember[field as "name" | "team" | "role"] !== member[field as "name" | "team" | "role"])) throw new Error(`Sync conflict for person ${member.name}.`);
    } else {
      const result = await client.from("dm_members").insert(member);
      if (result.error) throw result.error;
    }
  }
  for (const id of new Set(events.map(event => event.device_id))) {
    const result = await client.from("dm_devices").select("*").eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      const history = events.filter(event => event.device_id === id);
      if (history[0]?.before_data !== null) throw new Error(`Device ${id} is missing in Supabase. Apply the purchase-list migration before syncing.`);
      const latest = history[history.length - 1].after_data as Partial<Device>;
      const input = Object.fromEntries(editable.map(field => [field, latest[field] ?? null]));
      const inserted = await client.from("dm_devices").insert({ ...input, id });
      if (inserted.error) throw inserted.error;
      acknowledgeLocalChanges(history.map(event => event.id));
      continue;
    }
    const device = result.data as Device;
    const patch = planLocalSync(events, device);
    if (Object.keys(patch).length) {
      const saved = await client.from("dm_devices").update(patch).eq("id", id).eq("version", device.version).select("id").maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) throw new Error(`${device.name} changed during sync. Retry to check for conflicts.`);
    }
    acknowledgeLocalChanges(events.filter(event => event.device_id === id).map(event => event.id));
  }
}
