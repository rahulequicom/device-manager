import { getSupabase } from "./supabase";
import { isLocalInventory, localRegister, localUpdate, localAudit } from "./local-register";
import type { AuditEvent, Device, EmployeeDevice, Member } from "./device-data";
function database() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}
export async function loadEmployeeRegister() {
  if (isLocalInventory()) return localRegister();
  const devices: EmployeeDevice[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await database().rpc("dm_employee_catalog").range(offset, offset + 499);
    if (result.error) throw result.error;
    devices.push(...result.data as EmployeeDevice[]);
    if (result.data.length < 500) break;
  }
  const directory = await database().rpc("dm_employee_directory");
  if (directory.error) throw directory.error;
  return { devices, members: directory.data as Member[] };
}
export async function transferEmployeeDevice(device: EmployeeDevice, recipient: string, admin: boolean) {
  if (isLocalInventory()) {
    const current = localRegister().devices.find(row => row.id === device.id);
    if (!current) throw new Error("Device no longer exists. Refresh and try again.");
    return localUpdate({ ...current, version: device.version }, { holder_id: recipient });
  }
  if (admin) {
    const result = await database().from("dm_devices").update({ holder_id: recipient }).eq("id", device.id).eq("version", device.version).select().maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Device changed. Refresh before transferring.");
    return result.data as Device;
  }
  const result = await database().rpc("dm_employee_transfer", { p_device_id: device.id, p_recipient_id: recipient, p_version: device.version });
  if (result.error) throw result.error;
}

export async function loadEmployeeActivity(memberId: string | null, admin: boolean) {
  if (isLocalInventory()) return localAudit().filter(event => admin || (memberId && (event.before_data?.holder_id === memberId || event.after_data.holder_id === memberId)));
  // The employee RPC enforces participation and projects out private snapshots.
  const events: AuditEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await (admin ? database().from("dm_audit_events").select("id,device_id,device_name,action,actor,created_at,before_data,after_data").order("created_at", { ascending: false }).order("id") : database().rpc("dm_employee_activity")).range(offset, offset + 499);
    if (result.error) throw result.error;
    events.push(...result.data as AuditEvent[]);
    if (result.data.length < 500) return events;
  }
}

export async function selfAssignEmployeeDevice(device: EmployeeDevice, memberId: string | null) {
  if (isLocalInventory()) {
    const current = localRegister().devices.find(row => row.id === device.id);
    if (!memberId || !current || current.holder_id || current.retired || current.availability_confirmed === false) throw new Error("Device is no longer available.");
    return localUpdate({ ...current, version: device.version }, { holder_id: memberId });
  }
  const { error } = await database().rpc("dm_employee_self_assign", { p_device_id: device.id, p_version: device.version });
  if (error) throw error;
}
