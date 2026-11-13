import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
const code = stripTypeScriptTypes(readFileSync(new URL('../src/lib/activity.ts',import.meta.url),'utf8'));
const { activityTitle, activityTimestamp, activityMatches } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('activity uses historical transfer names and IST timestamps including seconds', () => {
  const members = [{ id:'rahul', name:'Rahul' },{ id:'raghu', name:'Raghu' }];
  const event = { action:'Transferred',before_data:{holder_id:'rahul'},after_data:{holder_id:'raghu'} };
  assert.equal(activityTitle(event,members),'Transferred from Rahul to Raghu');
  assert.equal(activityTitle({...event,action:'Transferred from rahul / QA to Raghu / QA'},[]),'Transferred from rahul / QA to Raghu / QA');
  const stamp = activityTimestamp('2026-11-13T08:50:09Z');
  assert.match(stamp,/13 Nov 2026/);
  assert.match(stamp,/02:20:09 pm/i);
  assert.equal(activityTimestamp('bad date'),'Timestamp unavailable');
});

test('admin activity filters both sides of a handover and searches device details', () => {
  const members = [{ id:"rahul", name:"Rahul" },{ id:"raghu", name:"Raghu" }];
  const event = { device_name:"Google phone",action:"Transferred",actor:"operator@company.test",before_data:{holder_id:"rahul"},after_data:{holder_id:"raghu",barcode:"EQ-123",serial_number:"SERIAL-1"} };
  assert.equal(activityMatches(event,members,"","rahul"),true);
  assert.equal(activityMatches(event,members,"","raghu"),true);
  assert.equal(activityMatches(event,members,"","unrelated"),false);
  for (const query of ["raghu","RAHUL","eq-123","serial-1","operator@company.test"]) assert.equal(activityMatches(event,members,query),true);
  assert.equal(activityMatches(event,members,"missing"),false);
});
