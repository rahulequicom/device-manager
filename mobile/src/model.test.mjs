import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialDevices, handover, validateDevice, findDevice, findRegisteredDevice, mergeRemoteDevices, linkBarcode, isProductBarcode, filterDevices, parseScannedDevice, mergeScannedDevice, lookupScannedProfile, awaitingDeviceSync, unavailableOnPackaging } from './model.ts';
test('handover preserves original records and records assignment, transfer and return', () => {
  const seed = initialDevices[0];
  const assigned = handover(seed, { team: 'Mobile', person: 'Mobile member 1' }, 'Admin');
  const transferred = handover(assigned, { team: 'QA', person: 'QA member 1' }, 'Admin');
  const returned = handover(transferred, null, 'Admin');
  assert.equal(seed.holder, null);
  assert.equal(assigned.holder.person, 'Mobile member 1');
  assert.equal(returned.holder, null);
  assert.equal(returned.history.length, 3);
  assert.throws(() => handover(assigned, assigned.holder, 'Admin'));
  assert.throws(() => handover(seed, null, 'Admin'));
});
test('registration rejects duplicate identities, incomplete records and invalid MAC addresses', () => {
  const d = initialDevices[0];
  assert.equal(validateDevice(initialDevices, d.values, d.barcode, d.id), null);
  assert.match(validateDevice(initialDevices, d.values, d.barcode), /already registered/);
  assert.match(validateDevice([], d.values.slice(0, 7), 'code'), /eight fields/);
  const values = [...d.values]; values[6] = 'invalid';
  assert.match(validateDevice([], values, 'code'), /hexadecimal/);
});
test('scan lookup normalizes codes and matches barcode, serial and asset ID', () => {
  assert.equal(findDevice(initialDevices, ' f92wlyv9nr ').id, 'MOB-001');
  assert.equal(findDevice(initialDevices, 'mob-001').id, 'MOB-001');
  assert.equal(findDevice(initialDevices, 'unknown'), undefined);
});
test('duplicate scan detection matches phone identities but ignores a shared product UPC', () => {
  const device = { ...initialDevices[0], identifiers: { imei: '354630188437582', upc: '195950644241' } };
  const devices = [device];
  assert.equal(findRegisteredDevice(devices, ['354630188437582'])?.id, 'MOB-001');
  assert.equal(findRegisteredDevice(devices, ['F92WLYV9NR'])?.id, 'MOB-001');
  assert.equal(findRegisteredDevice(devices, ['195950644241']), undefined);
});
test('web inventory merges into the phone register without losing local history', () => {
  const remote = [{
    id: 'remote-1', name: 'iPhone 16 Plus', model_name: 'iPhone 16 Plus', model_number: 'MXVV3HN/A',
    serial_number: 'F92WLYV9NR', ios_version: '26.6', capacity: '128 GB', wifi_address: '', bluetooth_address: '',
    barcode: 'EQ-002', imei: null, imei2: null, eid: null, upc: null, holder: { person: 'Bhumika', team: 'QA' },
  }];
  const local = [{ ...initialDevices[0], history: [{ text: 'Local note', at: '2026-10-14T00:00:00.000Z', actor: 'Test' }] }];
  const merged = mergeRemoteDevices(local, remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'MOB-001');
  assert.equal(merged[0].barcode, 'EQ-002');
  assert.equal(merged[0].barcodeAliases.includes('F92WLYV9NR'), true);
  assert.equal(merged[0].holder.person, 'Bhumika');
  assert.equal(merged[0].history[0].text, 'Local note');
});
test('box serial prefixes resolve without matching a different serial', () => {
  for (const code of ['SF92WLYV9NR', '(S)F92WLYV9NR', 'Serial: F92WLYV9NR']) assert.equal(findDevice(initialDevices, code).id, 'MOB-001');
  assert.equal(findDevice(initialDevices, 'SF92WLYV9NX'), undefined);
});
test('linking an IMEI retains the serial and existing history and prevents collisions', () => {
  const linked = linkBarcode(initialDevices, 'MOB-001', '123456789012345', 'code128', 'Admin');
  assert.equal(findDevice(linked, '123456789012345').id, 'MOB-001');
  assert.equal(findDevice(linked, 'F92WLYV9NR').id, 'MOB-001');
  assert.equal(initialDevices[0].barcodeAliases, undefined);
  assert.equal(linked[0].history.length, 1);
  assert.equal(linkBarcode(linked, 'MOB-001', '123456789012345', 'code128', 'Admin')[0].history.length, 1);
  const second = { ...initialDevices[0], id: 'MOB-002', barcode: 'OTHER', values: initialDevices[0].values.map((v, i) => i === 4 ? 'OTHER' : v) };
  assert.throws(() => linkBarcode([...linked, second], second.id, '123456789012345', 'code128', 'Admin'), /another phone/);
  assert.match(validateDevice(linked, second.values, '123456789012345'), /already registered/);
});
test('retail barcodes cannot become unique phone identifiers through scan linking', () => {
  assert.equal(isProductBarcode('ean13'), true);
  assert.equal(isProductBarcode('upc_a'), true);
  assert.equal(isProductBarcode('code128'), false);
  assert.throws(() => linkBarcode(initialDevices, 'MOB-001', '0123456789012', 'ean13', 'Admin'), /Product barcodes/);
});
test('scanned device payloads fill inventory fields and plain labels fill serial', () => {
  const parsed = parseScannedDevice(JSON.stringify({ name: 'iPhone 16 Plus White', iosVersion: '26.6', modelName: 'iPhone 16 Plus', modelNumber: 'MXVV3HN/A', serialNumber: 'F92WLYV9NR', capacity: '128 GB', wifiAddress: 'CC:3F:36:9A:55:F5', bluetooth: 'CC:3F:36:8B:18:22' }));
  assert.deepEqual(parsed.values, initialDevices[0].values);
  assert.equal(parsed.barcode, 'F92WLYV9NR');
  const plain = parseScannedDevice(' asset-123 ');
  assert.equal(plain.barcode, 'asset-123');
  assert.equal(plain.values[4], 'asset-123');
  assert.equal(plain.values[0], '');
});

test('labeled box payloads fill product and identifier fields together', () => {
  const scanned = parseScannedDevice('Name: iPhone 17 Sage; Model: iPhone 17; Model Number: A3520; Serial Number: CL4DY7FPWV; IMEI: 354630188437582; IMEI 2: 354630188535286; EID: 8904903202000884800235132661369; UPC: 195950644241; Capacity: 256 GB');
  assert.equal(scanned.values[0], 'iPhone 17 Sage');
  assert.equal(scanned.values[2], 'iPhone 17');
  assert.equal(scanned.values[3], 'A3520');
  assert.equal(scanned.values[4], 'CL4DY7FPWV');
  assert.equal(scanned.values[5], '256 GB');
  assert.equal(scanned.identifiers.imei, '354630188437582');
  assert.equal(scanned.identifiers.imei2, '354630188535286');
  assert.equal(scanned.identifiers.eid, '8904903202000884800235132661369');
  assert.equal(scanned.identifiers.upc, '195950644241');
});

test('serial aliases and URL payloads are accepted from box labels', () => {
  const labeled = parseScannedDevice('S/N: F92WLYV9NR; Product Name: iPhone 16 Plus White; iOS: 26.6');
  assert.equal(labeled.values[0], 'iPhone 16 Plus White');
  assert.equal(labeled.values[1], '26.6');
  assert.equal(labeled.values[4], 'F92WLYV9NR');
  const url = parseScannedDevice('https://device.example/label?serial_no=F92WLYV9NR&model=iPhone%2016%20Plus&ios_version=26.6');
  assert.equal(url.values[4], 'F92WLYV9NR');
  assert.equal(url.values[2], 'iPhone 16 Plus');
  assert.equal(url.values[1], '26.6');
});
test('multiple box labels accumulate into serial, IMEI, EID and UPC fields', () => {
  let captured = parseScannedDevice('');
  captured = mergeScannedDevice(captured, 'CL4DY7FPWV', 'code128');
  captured = mergeScannedDevice(captured, '354630188437582', 'code128');
  captured = mergeScannedDevice(captured, '8904903202000884800235132661369', 'code128');
  captured = mergeScannedDevice(captured, '195950644241', 'upc_a');
  assert.equal(captured.values[4], 'CL4DY7FPWV');
  assert.equal(captured.identifiers.imei, '354630188437582');
  assert.equal(captured.identifiers.eid, '8904903202000884800235132661369');
  assert.equal(captured.identifiers.upc, '195950644241');
});
test('one known box identifier returns a complete automatic profile', () => {
  const profile = lookupScannedProfile('354630188437582');
  assert.equal(profile?.values[0], 'iPhone 17 Sage');
  assert.equal(profile?.values[1], awaitingDeviceSync);
  assert.equal(profile?.values[6], unavailableOnPackaging);
  assert.equal(profile?.identifiers.eid, '8904903202000884800235132661369');
});
test('All includes every registered phone, and clearing filters restores the entire inventory', () => {
  const devices = Array.from({ length: 30 }, (_, i) => ({ ...initialDevices[0], id: `MOB-${i}`, values: initialDevices[0].values.map((v, n) => n === 0 ? `Phone ${i}` : v), holder: i % 2 ? { team: 'Mobile', person: 'Mobile member 1' } : null }));
  assert.equal(filterDevices(devices, '', 'All', 'All').length, 30);
  assert.equal(filterDevices(devices, '', 'All', 'Available').length, 15);
  assert.equal(filterDevices(devices, '', 'Mobile', 'Assigned').length, 15);
  assert.equal(filterDevices(devices, 'Phone 29', 'All', 'All')[0].id, 'MOB-29');
  assert.equal(filterDevices(devices, '', 'All', 'All').length, devices.length);
});
