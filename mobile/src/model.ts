export const fieldNames = ['Name', 'iOS Version', 'Model Name', 'Model Number', 'Serial Number', 'Capacity', 'Wi-Fi Address', 'Bluetooth'] as const;
export type Team = 'Mobile' | 'QA' | 'Design';
export type Holder = { team: Team; person: string };
export type DeviceIdentifiers = { imei?: string; imei2?: string; eid?: string; upc?: string };
export type Device = { id: string; values: string[]; barcode: string; barcodeAliases?: string[]; identifiers?: DeviceIdentifiers; holder: Holder | null; history: { text: string; at: string; actor: string }[] };
export type ScannedDevice = { barcode: string; values: string[]; identifiers: DeviceIdentifiers };
export const unavailableOnPackaging = 'Not available on packaging';
export const awaitingDeviceSync = 'Awaiting device sync';
export const members: Record<Team, string[]> = {
  Mobile: Array.from({ length: 5 }, (_, i) => `Mobile member ${i + 1}`),
  QA: Array.from({ length: 10 }, (_, i) => `QA member ${i + 1}`),
  Design: Array.from({ length: 4 }, (_, i) => `Design member ${i + 1}`),
};
export const initialDevices: Device[] = [{
  id: 'MOB-001', barcode: 'F92WLYV9NR', holder: null, history: [],
  values: ['iPhone 16 Plus White', '26.6', 'iPhone 16 Plus', 'MXVV3HN/A', 'F92WLYV9NR', '128 GB', 'CC:3F:36:9A:55:F5', 'CC:3F:36:8B:18:22'],
}];
const sampleBoxProfile: ScannedDevice = {
  barcode: 'CL4DY7FPWV',
  values: ['iPhone 17 Sage', awaitingDeviceSync, 'iPhone 17', 'A3520', 'CL4DY7FPWV', '256 GB', unavailableOnPackaging, unavailableOnPackaging],
  identifiers: { imei: '354630188437582', imei2: '354630188535286', eid: '8904903202000884800235132661369', upc: '195950644241' },
};
export function filterDevices(devices: Device[], query: string, team: Team | 'All', status: 'All' | 'Assigned' | 'Available') {
  const key = query.trim().toLowerCase();
  return devices.filter(d => (team === 'All' || d.holder?.team === team)
    && (status === 'All' || (status === 'Assigned' ? !!d.holder : !d.holder))
    && [...d.values, ...identifiers(d), d.holder?.person, d.holder?.team].join(' ').toLowerCase().includes(key));
}
export function findDevice(devices: Device[], code: string) {
  const key = code.trim().toLowerCase();
  return devices.find(d => identifiers(d).some(v => v.toLowerCase() === key)
    || [d.values[4], `S${d.values[4]}`, `(S)${d.values[4]}`, `Serial: ${d.values[4]}`].some(v => v.toLowerCase() === key));
}
function identifiers(d: Device) { return [d.id, d.barcode, d.values[4], d.identifiers?.imei, d.identifiers?.imei2, d.identifiers?.eid, d.identifiers?.upc, ...(d.barcodeAliases || [])].filter((v): v is string => !!v); }
export function findRegisteredDevice(devices: Device[], codes: string[]) {
  const keys = new Set(codes.map(code => code.trim().toLowerCase()).filter(Boolean));
  if (!keys.size) return undefined;
  return devices.find(d => [d.id, d.barcode, d.values[4], d.identifiers?.imei, d.identifiers?.imei2, d.identifiers?.eid, ...(d.barcodeAliases || [])]
    .filter((value): value is string => !!value)
    .some(value => keys.has(value.trim().toLowerCase())));
}
export type RemoteDeviceSnapshot = {
  id: string;
  name: string;
  model_name: string;
  model_number: string;
  serial_number: string | null;
  ios_version: string;
  capacity: string | null;
  wifi_address: string;
  bluetooth_address: string;
  barcode: string;
  imei: string | null;
  imei2: string | null;
  eid: string | null;
  upc: string | null;
  holder: { person: string; team: Team } | null;
};
function remoteToLocal(remote: RemoteDeviceSnapshot, existing?: Device): Device {
  const identifiers = {
    ...(existing?.identifiers || {}),
    ...(remote.imei ? { imei: remote.imei } : {}),
    ...(remote.imei2 ? { imei2: remote.imei2 } : {}),
    ...(remote.eid ? { eid: remote.eid } : {}),
    ...(remote.upc ? { upc: remote.upc } : {}),
  };
  const oldBarcode = existing && existing.barcode !== remote.barcode ? existing.barcode : undefined;
  return {
    id: existing?.id || `WEB-${remote.id}`,
    values: [remote.name, remote.ios_version || '', remote.model_name, remote.model_number || '', remote.serial_number || '', remote.capacity || '', remote.wifi_address || '', remote.bluetooth_address || ''],
    barcode: remote.barcode,
    barcodeAliases: Array.from(new Set([...(existing?.barcodeAliases || []), ...(oldBarcode ? [oldBarcode] : [])])),
    identifiers,
    holder: remote.holder,
    history: existing?.history || [],
  };
}
export function mergeRemoteDevices(local: Device[], remote: RemoteDeviceSnapshot[]) {
  const matched = new Set<string>();
  const devices = remote.map(item => {
    const existing = findRegisteredDevice(local, [`WEB-${item.id}`, item.id, item.barcode, item.serial_number || '', item.imei || '', item.imei2 || '', item.eid || '']);
    if (existing) matched.add(existing.id);
    return remoteToLocal(item, existing);
  });
  return [...devices, ...local.filter(device => !matched.has(device.id))];
}
export function isProductBarcode(type: string) {
  return ['ean13', 'ean8', 'upca', 'upce'].includes(type.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

function normalizeLabelKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseLabeledPayload(raw: string) {
  const values: Record<string, string> = {};
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).replace(/[?#]/g, '&') : '';
  const parts = `${raw}\n${query}`.replace(/\r/g, '').split(/[\n;&|,]+/);
  for (const part of parts) {
    const match = part.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
    if (!match) continue;
    const key = normalizeLabelKey(match[1]);
    const value = match[2].trim().replace(/^\((.*)\)$/, '$1');
    const decoded = (() => {
      try { return decodeURIComponent(value); } catch { return value; }
    })();
    if (key && decoded) values[key] = decoded;
  }
  return Object.keys(values).length ? values : undefined;
}

export function parseScannedDevice(raw: string): ScannedDevice {
  const code = raw.trim();
  const values = fieldNames.map(() => '');
  const identifiers: DeviceIdentifiers = {};
  if (!code) return { barcode: '', values, identifiers };
  try {
    const payload = JSON.parse(code) as Record<string, unknown>;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const read = (...keys: string[]) => keys.map(key => payload[key]).find(value => typeof value === 'string') as string | undefined;
      values[0] = read('name', 'deviceName') || '';
      values[1] = read('iosVersion', 'osVersion', 'systemVersion') || '';
      values[2] = read('modelName', 'model') || '';
      values[3] = read('modelNumber', 'modelIdentifier') || '';
      values[4] = read('serialNumber', 'serial', 'serialNumberValue') || '';
      values[5] = read('capacity', 'storage') || '';
      values[6] = read('wifiAddress', 'wifi', 'wifiMac') || '';
      values[7] = read('bluetooth', 'bluetoothAddress', 'bluetoothMac') || '';
      identifiers.imei = read('imei', 'imei1') || undefined;
      identifiers.imei2 = read('imei2') || undefined;
      identifiers.eid = read('eid') || undefined;
      identifiers.upc = read('upc', 'upcCode') || undefined;
      const barcode = read('barcode', 'assetCode', 'assetId') || values[4] || identifiers.imei || code;
      if (!values[4]) values[4] = barcode;
      return { barcode, values, identifiers };
    }
  } catch {
    // Most labels are simple serial or asset codes, not JSON payloads.
  }
  const labeled = parseLabeledPayload(code);
  if (labeled) {
    const read = (...keys: string[]) => keys.map(normalizeLabelKey).map(key => labeled[key]).find(Boolean) || '';
    values[0] = read('name', 'phoneName', 'deviceName', 'productName', 'marketingName');
    values[1] = read('iosVersion', 'ios', 'osVersion', 'os', 'softwareVersion', 'systemVersion');
    values[2] = read('modelName', 'model', 'productType');
    values[3] = read('modelNumber', 'modelNo', 'modelIdentifier', 'partNumber');
    values[4] = read('serialNumber', 'serialNo', 'serial', 'sn', 'sno', 'boxSerial');
    values[5] = read('capacity', 'storage', 'memory');
    values[6] = read('wifiAddress', 'wifi', 'wifiMac');
    values[7] = read('bluetooth', 'bluetoothAddress', 'bluetoothMac');
    identifiers.imei = read('imei', 'imei1') || undefined;
    identifiers.imei2 = read('imei2') || undefined;
    identifiers.eid = read('eid') || undefined;
    identifiers.upc = read('upc', 'upcCode', 'gtin') || undefined;
    const barcode = read('barcode', 'assetCode', 'assetId') || values[4] || identifiers.imei || '';
    return { barcode: barcode || code, values, identifiers };
  }
  values[4] = code;
  return { barcode: code, values, identifiers };
}
export function lookupScannedProfile(raw: string): ScannedDevice | undefined {
  const parsed = parseScannedDevice(raw);
  const scannedCodes = [parsed.barcode, parsed.values[4], ...Object.values(parsed.identifiers)].filter(Boolean).map(value => value.toLowerCase());
  const profileCodes = [sampleBoxProfile.barcode, sampleBoxProfile.values[3], sampleBoxProfile.values[4], ...Object.values(sampleBoxProfile.identifiers)];
  if (!profileCodes.some(value => scannedCodes.includes(value.toLowerCase()))) return undefined;
  return { barcode: sampleBoxProfile.barcode, values: [...sampleBoxProfile.values], identifiers: { ...sampleBoxProfile.identifiers, ...parsed.identifiers } };
}
export function mergeScannedDevice(previous: ScannedDevice, raw: string, type = 'manual'): ScannedDevice {
  const code = raw.trim();
  if (!code) return previous;
  const normalized = code.replace(/\s/g, '');
  const kind = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  const plainIdentifier = !code.startsWith('{') && (/^\d{15}$/.test(normalized) || /^\d{30,32}$/.test(normalized) || /^\d{12,13}$/.test(normalized) || isProductBarcode(kind));
  const parsed = parseScannedDevice(code);
  const values = previous.values.map((value, index) => index === 4 && plainIdentifier ? value : parsed.values[index] || value);
  const identifiers = { ...previous.identifiers, ...parsed.identifiers };
  if (!parsed.identifiers.imei && /^\d{15}$/.test(normalized)) {
    if (!identifiers.imei) identifiers.imei = code;
    else if (!identifiers.imei2 && identifiers.imei !== code) identifiers.imei2 = code;
  } else if (!parsed.identifiers.eid && /^\d{30,32}$/.test(normalized)) identifiers.eid = code;
  else if (!parsed.identifiers.upc && (isProductBarcode(kind) || /^\d{12,13}$/.test(normalized))) identifiers.upc = code;
  else if (!values[4]) values[4] = code;
  return { barcode: values[4] || previous.barcode || parsed.barcode || code, values, identifiers };
}
export function linkBarcode(devices: Device[], id: string, code: string, type: string, actor: string): Device[] {
  if (isProductBarcode(type)) throw new Error('Product barcodes identify a model, not an individual phone. Scan the Serial or IMEI label.');
  const value = code.trim(), device = devices.find(d => d.id === id);
  if (!value || !device) throw new Error('Choose a device and a valid barcode.');
  const existing = findDevice(devices, value);
  if (existing && existing.id !== id) throw new Error('This code is already linked to another phone.');
  if (existing) return devices;
  return devices.map(d => d.id === id ? {
    ...d, barcodeAliases: [...(d.barcodeAliases || []), value],
    history: [{ text: 'Box or asset barcode linked to this phone', at: new Date().toISOString(), actor }, ...d.history],
  } : d);
}
export function validateDevice(devices: Device[], values: string[], barcode: string, id?: string) {
  if (values.length !== 8 || values.some(v => !v.trim()) || !barcode.trim()) return 'Complete all eight fields and the barcode.';
  if ([values[6], values[7]].some(v => !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(v) && v !== unavailableOnPackaging)) return 'Use six hexadecimal pairs separated by colons for network addresses.';
  if ([barcode, values[4]].some(code => { const match = findDevice(devices.filter(d => d.id !== id), code); return !!match; })) return 'This barcode or serial number is already registered.';
  return null;
}
export function handover(device: Device, next: Holder | null, actor: string, at = new Date().toISOString()): Device {
  if (next && !members[next.team].includes(next.person)) throw new Error('Choose a valid team member.');
  if (next?.person === device.holder?.person && next?.team === device.holder?.team) throw new Error('This person already holds the phone.');
  if (!next && !device.holder) throw new Error('This phone is already available.');
  const text = next
    ? device.holder ? `Transferred from ${device.holder.person} to ${next.person} / ${next.team}` : `Assigned to ${next.person} / ${next.team}`
    : `Returned by ${device.holder!.person} / ${device.holder!.team}`;
  return { ...device, holder: next, history: [{ text, at, actor }, ...device.history] };
}
