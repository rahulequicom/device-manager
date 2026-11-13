import type { Device, Member } from "./device-data";

export type DemoContact = { phone: string; email: string };
export type DemoLocation = { latitude: number; longitude: number; accuracy: number; address: string; at: string };
export type TrackedDevice = {
  device: Device;
  holder: Member | null;
  contact: DemoContact;
  assignedAt: string | null;
  location: DemoLocation | null;
  history: DemoLocation[];
  permission: "granted" | "denied" | "unknown";
  lastSeen: string | null;
  lastActivity: string | null;
  battery: number | null;
};
export const trackingStatuses = ["Recent location", "Stale location", "No location", "Permission off", "Not connected"] as const;
export const demoContactStorageKey = "dm_tracking_demo_contacts_v1";

const sampleHolders: Member[] = [
  { id: "demo-arshad", name: "Arshad", team: "QA", role: "Device coordinator" },
  { id: "demo-bhumika", name: "Bhumika", team: "Design", role: "Designer" }
];
// Public landmarks, never inferred employee locations or office addresses.
const samplePlaces = [
  { latitude: 12.9763, longitude: 77.5929, address: "Cubbon Park, Bengaluru" },
  { latitude: 12.9507, longitude: 77.5848, address: "Lalbagh Botanical Garden, Bengaluru" },
  { latitude: 12.9756, longitude: 77.6067, address: "MG Road, Bengaluru" }
];
export function createTrackingDemo(devices: Device[], members: Member[], now: number): TrackedDevice[] {
  return devices.map((device, index) => {
    const mode = index % 6;
    const holder = mode === 4 ? null : members.find(member => member.id === device.holder_id) ?? sampleHolders[index % sampleHolders.length];
    const age = mode === 1 ? 95 : 2 + index;
    const location = mode === 0 || mode === 1 || mode === 5
      ? { ...samplePlaces[index % samplePlaces.length], accuracy: 20 + index * 5, at: new Date(now - age * 60000).toISOString() } : null;
    return {
      device, holder,
      contact: { phone: `+1 202 555 ${index % 2 === 0 ? "0101" : "0102"}`, email: `${holder?.name.toLowerCase().replace(/[^a-z0-9]+/g, ".") || "holder"}@example.com` },
      assignedAt: holder ? new Date(now - (index + 2) * 86400000).toISOString() : null,
      location, history: location ? Array.from({ length: 4 }, (_, i) => ({ ...samplePlaces[(index + i) % samplePlaces.length], accuracy: 20 + i * 10, at: new Date(Date.parse(location.at) - i * 3600000).toISOString() })) : [],
      permission: mode === 3 ? "denied" : mode === 4 ? "unknown" : "granted",
      lastSeen: mode === 4 ? null : new Date(now - age * 60000).toISOString(),
      lastActivity: mode === 4 ? null : new Date(now - (age + 8) * 60000).toISOString(),
      battery: mode === 4 ? null : Math.max(12, 68 - index * 4)
    };
  });
}
export function trackingStatus(record: TrackedDevice, now: number): typeof trackingStatuses[number] {
  if (!record.lastSeen) return "Not connected";
  if (record.permission === "denied") return "Permission off";
  if (!record.location) return "No location";
  return now - Date.parse(record.location.at) <= 15 * 60000 ? "Recent location" : "Stale location";
}
export function mapLinks(location: DemoLocation) {
  const { latitude, longitude } = location;
  const coordinates = `${latitude},${longitude}`;
  return {
    google: `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: coordinates })}`,
    apple: `https://maps.apple.com/frame?${new URLSearchParams({ center: coordinates, span: "0.005,0.005" })}`,
    embed: `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({ bbox: `${longitude - 0.008},${latitude - 0.004},${longitude + 0.008},${latitude + 0.004}`, layer: "mapnik", marker: coordinates })}`
  };
}
export function validateContact(values: DemoContact): DemoContact {
  const phone = values.phone.trim();
  const email = values.email.trim().toLowerCase();
  if (phone && (!/^\+?[0-9 ()-]{7,24}$/.test(phone) || phone.replace(/\D/g, "").length < 7)) throw new Error("Enter a valid contact number, including the country code.");
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error("Enter a valid email address.");
  return { phone, email };
}
export function readDemoContacts(): Record<string, DemoContact> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(demoContactStorageKey) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).flatMap(([id, value]) => {
      if (!value || typeof value !== "object" || typeof value.phone !== "string" || typeof value.email !== "string") return [];
      try { return [[id, validateContact(value)]]; } catch { return []; }
    }));
  } catch { return {}; }
}
