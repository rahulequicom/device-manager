import type { AuditEvent, Member } from "./device-data";

export function activityTitle(event: AuditEvent, members: Member[]) {
  const from = event.before_data?.holder_id;
  const to = event.after_data.holder_id;
  // Database action text preserves the names/teams at the time of transfer.
  if (from && to && from !== to && !event.action.startsWith("Transferred from ")) {
    const name = (id: string) => members.find(member => member.id === id)?.name || "Previous employee";
    return `Transferred from ${name(from)} to ${name(to)}`;
  }
  return event.action;
}
export function activityTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(date);
}

export function activityMatches(event: AuditEvent, members: Member[], query: string, memberId = "") {
  const from = event.before_data?.holder_id;
  const to = event.after_data.holder_id;
  if (memberId && from !== memberId && to !== memberId) return false;
  const participants = members.filter(member => member.id === from || member.id === to).map(member => member.name);
  return [event.device_name, activityTitle(event, members), event.actor, event.after_data.barcode, event.before_data?.barcode, event.after_data.serial_number, event.before_data?.serial_number, ...participants].join(" ").toLowerCase().includes(query.trim().toLowerCase());
}
