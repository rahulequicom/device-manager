export const teams = ["Mobile", "QA", "Design"] as const;
export type Team = (typeof teams)[number];
export type DeviceStatus = "Assigned" | "Available" | "Retiring" | "Not confirmed";
export const statusOrder: DeviceStatus[] = ["Assigned", "Available", "Retiring"];
export const platforms = ["iOS", "Android"] as const;
export type Platform = (typeof platforms)[number];
export type Member = { id: string; name: string; team: Team; role: string };
export type Device = {
  id: string;
  name: string;
  model_name: string;
  model_number: string;
  serial_number: string | null;
  ios_version: string;
  platform: Platform | null;
  capacity: string | null;
  wifi_address: string;
  bluetooth_address: string;
  barcode: string;
  imei?: string | null;
  imei2?: string | null;
  eid?: string | null;
  upc?: string | null;
  mobile_scan_id?: string | null;
  holder_id: string | null;
  retired: boolean;
  updated_at: string;
  version: number;
  allocation_team?: Team | null;
  ram?: string | null;
  availability_confirmed?: boolean;
};
export type DeviceInput = Pick<Device, "name" | "model_name" | "model_number" | "serial_number" | "ios_version" | "capacity" | "wifi_address" | "bluetooth_address" | "barcode" | "ram" | "allocation_team" | "availability_confirmed"> & { platform: Platform; holder_id?: string | null };
export type AuditEvent = { id: string; device_id: string; device_name: string; action: string; actor: string; created_at: string; before_data: Partial<Device> | null; after_data: Partial<Device> };
export function deviceStatus(device: Device): DeviceStatus {
  if (device.retired) return "Retiring";
  if (device.holder_id) return "Assigned";
  if (device.availability_confirmed === false) return "Not confirmed";
  return "Available";
}
export function statusTone(status: DeviceStatus) {
  return status === "Available" ? "good" : status === "Retiring" ? "danger" : "neutral";
}
export function isOwnershipEvent(event: AuditEvent) {
  return event.before_data === null || (event.before_data.holder_id ?? null) !== (event.after_data.holder_id ?? null);
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
