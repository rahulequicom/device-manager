import { mergeRemoteDevices, type Device, type RemoteDeviceSnapshot } from './model';

export type CloudSyncResult =
  | { synced: true }
  | { synced: false; reason: 'not-configured' };

export type RegisteredIdentity = { name: string };
export type RemoteDevice = RemoteDeviceSnapshot;
export type RemoteInventory = { devices: RemoteDevice[] };

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yffjmvcherbenyxqfvkb.supabase.co').replace(/\/$/, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_PfvAIatRVtnAyNO3ejK28w_lERX924N';

export async function checkRegisteredIdentity(identity: {
  serial?: string;
  imei?: string;
  imei2?: string;
  eid?: string;
  barcode?: string;
}): Promise<RegisteredIdentity | null> {
  if (!supabaseUrl || !publishableKey) return null;
  const values = Object.values(identity).filter(value => !!value?.trim());
  if (!values.length) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/dm_check_mobile_identity`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_serial: identity.serial || null,
      p_imei: identity.imei || null,
      p_imei2: identity.imei2 || null,
      p_eid: identity.eid || null,
      p_barcode: identity.barcode || null,
    }),
  });
  if (!response.ok) return null;
  const result = await response.json().catch(() => null) as { registered?: boolean; name?: string } | null;
  return result?.registered ? { name: result.name || 'This phone' } : null;
}

export async function fetchInventorySnapshot(): Promise<RemoteInventory> {
  if (!supabaseUrl || !publishableKey) return { devices: [] };
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/dm_mobile_inventory`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) throw new Error(`Web inventory refresh failed (${response.status})`);
  const result = await response.json().catch(() => null) as { devices?: unknown } | null;
  const devices = Array.isArray(result?.devices) ? result.devices.filter((device): device is RemoteDevice => {
    if (!device || typeof device !== 'object') return false;
    const value = device as Partial<RemoteDevice>;
    return typeof value.id === 'string' && typeof value.name === 'string' && typeof value.model_name === 'string' && typeof value.barcode === 'string';
  }) : [];
  return { devices };
}

function macAddress(value: string) {
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value.trim()) ? value.trim().toUpperCase() : '';
}

function platformFor(device: Device) {
  const name = `${device.values[0]} ${device.values[2]}`.toLowerCase();
  return name.includes('iphone') || name.includes('ipad') || name.includes('ios') ? 'iOS' : 'Android';
}

export async function syncDeviceSnapshot(device: Device): Promise<CloudSyncResult> {
  if (!supabaseUrl || !publishableKey) return { synced: false, reason: 'not-configured' };

  const [name, iosVersion, modelName, modelNumber, serialNumber, capacity, wifi, bluetooth] = device.values;
  const response = await fetch(`${supabaseUrl}/rest/v1/dm_mobile_scans`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      source_device_id: device.id,
      captured_at: new Date().toISOString(),
      name,
      model_name: modelName,
      model_number: modelNumber,
      serial_number: serialNumber || null,
      ios_version: iosVersion,
      platform: platformFor(device),
      capacity: capacity || null,
      wifi_address: macAddress(wifi),
      bluetooth_address: macAddress(bluetooth),
      barcode: device.barcode,
      imei: device.identifiers?.imei || null,
      imei2: device.identifiers?.imei2 || null,
      eid: device.identifiers?.eid || null,
      upc: device.identifiers?.upc || null,
      payload: { values: device.values, identifiers: device.identifiers || {}, holder: device.holder },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase sync failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  return { synced: true };
}
