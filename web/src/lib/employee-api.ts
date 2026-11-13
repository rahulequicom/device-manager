import { getSupabase } from "./supabase";
import { isLocalInventory, localRegister, localAddDevice, localUpdate, localAudit } from "./local-register";
import type { AuditEvent, Device, Member, Platform } from "./device-data";
export type Registration = { name: string; model_name: string; platform: Platform; serial_number: string | null; capacity: string | null; barcode: string };
function database() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}
export async function loadEmployeeRegister() {
  if (isLocalInventory()) return localRegister();
  const devices: Device[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await database().from("dm_devices").select("*").order("id").range(offset, offset + 499);
    if (result.error) throw result.error;
    devices.push(...result.data as Device[]);
    if (result.data.length < 500) break;
  }
  const directory = await database().rpc("dm_employee_directory");
  if (directory.error) throw directory.error;
  return { devices, members: directory.data as Member[] };
}
export async function registerEmployeeDevice(input: Registration, memberId: string | null, admin: boolean) {
  if (isLocalInventory()) return localAddDevice(input, memberId);
  if (admin) {
    const result = await database().from("dm_devices").insert({ ...input, barcode: input.barcode || `EQ-${crypto.randomUUID()}`, holder_id: memberId, availability_confirmed: !!memberId }).select().single();
    if (result.error) throw result.error;
    return result.data as Device;
  }
  const result = await database().rpc("dm_employee_add_device", { p_input: input });
  if (result.error) throw result.error;
  return result.data as Device;
}
export async function transferEmployeeDevice(device: Device, recipient: string, admin: boolean) {
  if (isLocalInventory()) return localUpdate(device, { holder_id: recipient });
  if (admin) {
    const result = await database().from("dm_devices").update({ holder_id: recipient }).eq("id", device.id).eq("version", device.version).select().maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Device changed. Refresh before transferring.");
    return result.data as Device;
  }
  const result = await database().rpc("dm_employee_transfer", { p_device_id: device.id, p_recipient_id: recipient, p_version: device.version });
  if (result.error) throw result.error;
  return result.data as Device;
}

export async function loadEmployeeActivity(memberId: string | null, admin: boolean) {
  if (isLocalInventory()) return localAudit().filter(event => admin || (memberId && (event.before_data?.holder_id === memberId || event.after_data.holder_id === memberId)));
  // RLS enforces participation even if a caller changes the client-side arguments.
  const events: AuditEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await database().from("dm_audit_events").select("id,device_id,device_name,action,actor,created_at,before_data,after_data").order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (result.error) throw result.error;
    events.push(...result.data as AuditEvent[]);
    if (result.data.length < 500) return events;
  }
}
