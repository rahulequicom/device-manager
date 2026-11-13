const seed: typeof import("./local-seed.json") = process.env.NODE_ENV === "development" ? require("./local-seed.json") : [];
import type { Device, DeviceInput, Member, AuditEvent } from "./device-data";
const key = "device-manager-local-inventory-v1";
type Register = { devices: Device[]; members: Member[]; audit: AuditEvent[]; syncedAuditIds?: string[] };
export function isLocalInventory() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_INVENTORY === "true" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cloud") !== "1" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}
function read(): Register {
  if (!isLocalInventory()) throw new Error("Local inventory requires localhost development mode.");
  const saved = localStorage.getItem(key);
  if (saved) {
    const value = JSON.parse(saved) as Register;
    if (!Array.isArray(value.devices) || !Array.isArray(value.members) || !Array.isArray(value.audit)) throw new Error("Invalid local inventory storage.");
    return value;
  }
  const value: Register = { devices: seed.map(device => ({ ...device, platform: device.platform as Device["platform"], allocation_team: device.allocation_team as Device["allocation_team"], model_number: "", ios_version: "", wifi_address: "", bluetooth_address: "", holder_id: null, retired: false, version: 1, updated_at: new Date().toISOString() })), members: [], audit: [] };
  write(value); return value;
}
function write(value: Register) {
  localStorage.setItem(key, JSON.stringify(value));
  if (typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("local-inventory-change"));
}
export function localRegister() { const { devices, members } = read(); return { devices, members }; }
export function localAudit(id?: string) { return read().audit.filter(event => !id || event.device_id === id); }
export function localAddMember(input: Omit<Member, "id">) {
  if (!input.name.trim()) throw new Error("Name is required.");
  const value = read(); const member = { ...input, id: crypto.randomUUID() };
  value.members.push(member); write(value); return member;
}
export function localUpdate(previous: Device, change: Partial<Device>) {
  const value = read(); const index = value.devices.findIndex(device => device.id === previous.id); const before = value.devices[index];
  if (!before || before.version !== previous.version) throw new Error("This device changed. Refresh before saving again.");
  const next = { ...before, ...change, id: before.id, version: before.version + 1, updated_at: new Date().toISOString() };
  if (!next.name.trim() || !next.model_name.trim() || !next.barcode.trim()) throw new Error("Name, model and barcode are required.");
  if (next.holder_id && !value.members.some(member => member.id === next.holder_id)) throw new Error("Choose an existing person.");
  if (next.retired && next.holder_id) throw new Error("Return the device before retiring it.");
  next.serial_number = next.serial_number?.trim().toUpperCase() || null; next.barcode = next.barcode.trim();
  if (value.devices.some(device => device.id !== next.id && (device.barcode === next.barcode || (next.serial_number && device.serial_number === next.serial_number)))) throw new Error("That serial number or barcode is already registered.");
  if (before.holder_id !== next.holder_id || before.retired !== next.retired) next.availability_confirmed = true;
  value.devices[index] = next;
  value.audit.unshift({ id: crypto.randomUUID(), device_id: next.id, device_name: next.name, action: before.retired !== next.retired ? (next.retired ? "Retired" : "Restored") : before.holder_id !== next.holder_id ? (next.holder_id ? (before.holder_id ? "Transferred" : "Assigned") : "Returned") : "Updated", actor: "Local coordinator", created_at: next.updated_at, before_data: before, after_data: next });
  write(value); return next;
}

// Snapshot the pending edits so changes made during a sync remain pending.
export function pendingLocalChanges() {
  const value = read();
  return { members: value.members, events: value.audit.filter(event => !value.syncedAuditIds?.includes(event.id)).reverse() };
}
export function acknowledgeLocalChanges(ids: string[]) {
  const value = read();
  value.syncedAuditIds = [...new Set([...(value.syncedAuditIds ?? []), ...ids])];
  localStorage.setItem(key, JSON.stringify(value));
}

export function localAddDevice(input: Pick<DeviceInput, "name" | "model_name" | "platform" | "serial_number" | "capacity" | "barcode"> & Partial<DeviceInput>, holderId: string | null) {
  const value = read();
  if (!input.name.trim() || !input.model_name.trim()) throw new Error("Name and model are required.");
  if (holderId && !value.members.some(member => member.id === holderId)) throw new Error("Choose an existing employee.");
  const serial = input.serial_number?.trim().toUpperCase() || null;
  const barcode = input.barcode.trim() || `EQ-${crypto.randomUUID()}`;
  if (value.devices.some(device => device.barcode.toLowerCase() === barcode.toLowerCase() || (serial && device.serial_number?.toUpperCase() === serial))) throw new Error("That serial number or barcode is already registered.");
  const device: Device = { ...input, id: crypto.randomUUID(), name: input.name.trim(), model_name: input.model_name.trim(), serial_number: serial, barcode, model_number: input.model_number ?? "", ios_version: input.ios_version ?? "", wifi_address: input.wifi_address ?? "", bluetooth_address: input.bluetooth_address ?? "", holder_id: holderId, availability_confirmed: true, allocation_team: input.allocation_team ?? null, ram: input.ram ?? null, retired: false, version: 1, updated_at: new Date().toISOString() };
  value.devices.push(device);
  value.audit.unshift({ id: crypto.randomUUID(), device_id: device.id, device_name: device.name, action: "Registered", actor: "Local coordinator", created_at: device.updated_at, before_data: null, after_data: device });
  write(value); return device;
}
