import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';

test('local inventory is gated and persists edits, assignments and audit', async () => {
  const source = readFileSync(new URL('../src/lib/local-register.ts', import.meta.url), 'utf8').replace('const seed: typeof import("./local-seed.json") = process.env.NODE_ENV === "development" ? require("./local-seed.json") : [];', `const seed = ${readFileSync(new URL('../src/lib/local-seed.json', import.meta.url), 'utf8')};`);
  const js = stripTypeScriptTypes(source);
  const api = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const oldEnv = process.env.NODE_ENV; const oldFlag = process.env.NEXT_PUBLIC_LOCAL_INVENTORY;
  const oldWindow = globalThis.window; const oldStorage = globalThis.localStorage;
  const storage = new Map();
  try {
    globalThis.window = { location: { hostname: '127.0.0.1' } };
    globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) };
    process.env.NEXT_PUBLIC_LOCAL_INVENTORY = 'true';
    process.env.NODE_ENV = 'production'; assert.equal(api.isLocalInventory(), false); assert.throws(() => api.localRegister());
    process.env.NODE_ENV = 'development'; window.location.hostname = 'example.com'; assert.equal(api.isLocalInventory(), false);
    window.location.hostname = 'localhost'; process.env.NEXT_PUBLIC_LOCAL_INVENTORY = 'false'; assert.equal(api.isLocalInventory(), false);
    process.env.NEXT_PUBLIC_LOCAL_INVENTORY = 'true'; assert.equal(api.isLocalInventory(), true);
    const { devices } = api.localRegister(); assert.equal(devices.length, 12);
    const member = api.localAddMember({ name: 'Local tester', team: 'QA', role: 'Tester' });
    const assigned = api.localUpdate(devices[0], { holder_id: member.id });
    assert.equal(api.localRegister().devices[0].holder_id, member.id);
    assert.equal(api.localAudit(assigned.id)[0].action, 'Assigned');
    assert.throws(() => api.localUpdate(devices[0], { name: 'Stale' }), /changed/);
    assert.throws(() => api.localUpdate(assigned, { barcode: devices[1].barcode }), /already registered/);
    assert.throws(() => api.localUpdate(assigned, { retired: true }), /Return/);
    const returned = api.localUpdate(assigned, { holder_id: null });
    assert.equal(api.localAudit(returned.id)[0].action, 'Returned');
    const pending = api.pendingLocalChanges();
    assert.equal(pending.events.length, 2);
    api.acknowledgeLocalChanges([pending.events[0].id]);
    assert.equal(api.pendingLocalChanges().events.length, 1);
    assert.equal(api.localAudit(returned.id).length, 2);
    const created = api.localAddDevice({ name: "New device", model_name: "Pixel", imei: "123456789012345", model_number: "PIXEL-9", platform: "Android", serial_number: " local-new ", capacity: null, barcode: "" }, member.id);
    assert.equal(created.holder_id, member.id);
    assert.equal(created.serial_number, "LOCAL-NEW");
    assert.equal(created.imei, "123456789012345");
    assert.equal(created.model_number, "PIXEL-9");
    assert.equal(api.localAudit(created.id)[0].before_data, null);
    assert.throws(() => api.localAddDevice({ name: "Duplicate", model_name: "Pixel", platform: "Android", serial_number: "LOCAL-NEW", capacity: null, barcode: "" }, member.id), /already registered/);
    globalThis.localStorage.setItem = () => { throw new Error('Storage full'); };
    assert.throws(() => api.localUpdate(returned, { name: 'Failed save' }), /Storage full/);
    assert.equal(api.localRegister().devices[0].name, returned.name);
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_LOCAL_INVENTORY; else process.env.NEXT_PUBLIC_LOCAL_INVENTORY = oldFlag;
    globalThis.window = oldWindow; globalThis.localStorage = oldStorage;
  }
});
