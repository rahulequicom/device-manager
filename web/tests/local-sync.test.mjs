import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/local-sync.ts', import.meta.url), 'utf8').replace('import { pendingLocalChanges, acknowledgeLocalChanges } from "./local-register";', 'const pendingLocalChanges = () => globalThis.syncFixture.pending; const acknowledgeLocalChanges = ids => globalThis.syncFixture.ack.push(...ids);');
const api = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const before = { id: 'device', name: 'Phone', model_name: 'Model', model_number: '', serial_number: null, ios_version: '', platform: 'Android', capacity: null, wifi_address: '', bluetooth_address: '', barcode: 'EQ-001', ram: null, allocation_team: 'QA', availability_confirmed: false, holder_id: null, retired: false, version: 1 };
const after = { ...before, name: 'Edited phone', version: 2 };
const event = { id: 'edit', device_id: before.id, before_data: before, after_data: after };

test('sync planner sends only edits, preserves remote fields, rejects conflicts and supports retry', () => {
  assert.deepEqual(api.planLocalSync([event], { ...before, capacity: '256 GB', version: 80 }), { name: after.name });
  assert.deepEqual(api.planLocalSync([event], { ...after, version: 81 }), {});
  assert.throws(() => api.planLocalSync([event], { ...before, name: 'Cloud edit' }), /conflict/);
  assert.throws(() => api.planLocalSync([{ ...event, before_data: {} }], before), /Incomplete/);
});

function client({ admin = true, reject = false, concurrent = false, remote = before } = {}) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) }, from(table) {
    let patch; const filters = [];
    const query = {
      select() { return query; },
      eq(field, value) { filters.push([field, value]); return query; },
      update(value) { patch = value; return query; },
      async maybeSingle() {
        if (table === 'dm_admins') return { data: admin ? { user_id: 'admin' } : null };
        if (table === 'dm_devices' && patch) {
          calls.push({ patch, filters });
          return reject ? { error: new Error('network failure') } : { data: concurrent ? null : { id: 'device' } };
        }
        return { data: remote };
      }
    };
    return query;
  } };
}

test('authenticated sync checks membership, versions writes and acknowledges only successful uploads', async () => {
  try {
    globalThis.syncFixture = { pending: { members: [], events: [event] }, ack: [] };
    await assert.rejects(api.syncLocalInventory(client({ admin: false })), /dm_admins/);
    assert.deepEqual(globalThis.syncFixture.ack, []);
    await assert.rejects(api.syncLocalInventory(client({ reject: true })), /network failure/);
    await assert.rejects(api.syncLocalInventory(client({ concurrent: true })), /changed during sync/);
    await assert.rejects(api.syncLocalInventory(client({ remote: { ...before, name: 'Cloud edit' } })), /conflict/);
    assert.deepEqual(globalThis.syncFixture.ack, []);
    const connected = client();
    await api.syncLocalInventory(connected);
    assert.deepEqual(connected.calls, [{ patch: { name: after.name }, filters: [['id', 'device'], ['version', 1]] }]);
    assert.deepEqual(globalThis.syncFixture.ack, ['edit']);
    globalThis.syncFixture.ack = [];
    const retried = client({ remote: after });
    await api.syncLocalInventory(retried);
    assert.equal(retried.calls.length, 0);
    assert.deepEqual(globalThis.syncFixture.ack, ['edit']);
  } finally { delete globalThis.syncFixture; }
});

test('people upload before assignments and retries reuse their IDs', async () => {
  const member = { id: 'member', name: 'Tester', team: 'QA', role: 'QA' };
  const assignment = { ...event, after_data: { ...before, holder_id: member.id, availability_confirmed: true } };
  let savedMember = null; let inserts = 0; let denyInsert = true;
  const connected = client(); const originalFrom = connected.from;
  connected.from = table => {
    if (table !== 'dm_members') return originalFrom(table);
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: savedMember }; },
      async insert(value) {
        if (denyInsert) return { error: new Error('member upload failed') };
        savedMember = value; inserts++; return {};
      }
    }; return query;
  };
  try {
    globalThis.syncFixture = { pending: { members: [member], events: [assignment] }, ack: [] };
    await assert.rejects(api.syncLocalInventory(connected), /member upload failed/);
    assert.equal(connected.calls.length, 0); assert.deepEqual(globalThis.syncFixture.ack, []);
    denyInsert = false;
    await api.syncLocalInventory(connected);
    assert.equal(inserts, 1); assert.equal(connected.calls[0].patch.holder_id, member.id);
    globalThis.syncFixture.pending.events = [];
    await api.syncLocalInventory(connected); assert.equal(inserts, 1);
    savedMember = { ...member, name: 'Changed in cloud' };
    await assert.rejects(api.syncLocalInventory(connected), /conflict for person/);
  } finally { delete globalThis.syncFixture; }
});

test('new local registrations insert with stable IDs and retry without duplicating', async () => {
  const registered = { ...before, version: 1 };
  let stored = null; let inserts = 0;
  const connected = client(); const originalFrom = connected.from;
  connected.from = table => {
    if (table !== 'dm_devices') return originalFrom(table);
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: stored }; },
      async insert(input) { stored = input; inserts++; return {}; }
    }; return query;
  };
  try {
    globalThis.syncFixture = { pending: { members: [], events: [{ ...event, before_data: null, after_data: registered }] }, ack: [] };
    await api.syncLocalInventory(connected);
    assert.equal(inserts, 1); assert.equal(stored.id, registered.id);
    assert.equal('version' in stored, false);
    await api.syncLocalInventory(connected);
    assert.equal(inserts, 1);
    stored = { ...stored, name: 'Cloud changed registration' };
    await assert.rejects(api.syncLocalInventory(connected), /conflict/);
  } finally { delete globalThis.syncFixture; }
});
