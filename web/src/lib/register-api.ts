import { isLocalInventory, localRegister, localAudit, localUpdate, localAddMember, localAddDevice } from "./local-register";
import { getSupabase } from "./supabase";
import type { AuditEvent, Device, DeviceInput, Member } from "./device-data";

function database() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}
export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === "23505") return "That serial number or barcode is already registered.";
    if (error.code === "42501") return "Your account does not have permission to make this change.";
    if (error.code === "PGRST204" || error.code === "42703") return "The database needs the latest inventory migration. Ask your administrator to run 202610140003_ship_inventory.sql.";
  }
  return error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "Something went wrong. Please try again.";
}

// Fetch every page so dashboard totals do not silently stop at the API row limit.
async function allRows<T>(table: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await database().from(table).select(columns).order(order).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data as unknown as T[]));
    if (data.length < 500) return rows;
  }
}
export async function loadRegister() {
  if (isLocalInventory()) return localRegister();
  const { error: importError } = await database().rpc("dm_import_mobile_scans");
  // Keep the existing dashboard usable until the optional mobile-sync migration
  // has been run in the project's SQL editor.
  if (importError && !["PGRST202", "42883"].includes(importError.code ?? "")) throw importError;
  const [devices, members] = await Promise.all([
    allRows<Device>("dm_devices", "*", "id"),
    allRows<Member>("dm_members", "id,name,team,role", "id")
  ]);
  return { devices, members };
}
export async function loadAudit(deviceId?: string) {
  if (isLocalInventory()) return localAudit(deviceId);
  const events: AuditEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = database().from("dm_audit_events").select("id,device_id,device_name,action,actor,created_at,before_data,after_data").order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (deviceId) query = query.eq("device_id", deviceId);
    const { data, error } = await query;
    if (error) throw error;
    events.push(...data as AuditEvent[]);
    if (data.length < 500) return events;
  }
}
export async function saveDevice(input: DeviceInput, previous: Device) {
  if (isLocalInventory()) return localUpdate(previous, input);
  const request = database().from("dm_devices").update(input).eq("id", previous.id).eq("version", previous.version);
  const { data, error } = await request.select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This device changed in another session. Refresh before saving again.");
  return data as Device;
}
export async function changeDevice(device: Device, change: { holder_id?: string | null; retired?: boolean; availability_confirmed?: boolean }) {
  if (isLocalInventory()) return localUpdate(device, change);
  const { data, error } = await database().from("dm_devices").update(change).eq("id", device.id).eq("version", device.version).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This device changed in another session. Refresh before trying again.");
  return data as Device;
}
export async function addMember(input: Omit<Member, "id">) {
  if (isLocalInventory()) return localAddMember(input);
  const { data, error } = await database().from("dm_members").insert(input).select().single();
  if (error) throw error;
  return data as Member;
}

export async function addDevice(input: DeviceInput) {
  if (isLocalInventory()) return localAddDevice(input, null);
  const { data, error } = await database().from("dm_devices").insert({ ...input, availability_confirmed: true }).select().single();
  if (error) throw error;
  return data as Device;
}
