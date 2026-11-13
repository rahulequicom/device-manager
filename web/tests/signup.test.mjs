import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('signup activation requires verified, explicitly approved email and cannot claim another employee', async () => {
  const db = new PGlite();
  const user = '11111111-1111-4111-8111-111111111111';
  const outsider = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;
      insert into auth.users values ('${user}','BHUMIKA@equicomtech.com',null),('${outsider}','other@equicomtech.com',now());`);
    for (const file of ['202610140001_device_register.sql','202610140003_ship_inventory.sql','202610140008_employee_portal.sql','202610140009_employee_signup.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
    await db.exec("insert into dm_members(name,team) values ('bhumika','QA'),('rahul','QA'),('Shaina','Design'),('Praveen','Design');");
    const setup = await readFile(new URL('../../supabase/setup-employee-signup.sql',import.meta.url),'utf8');
    await db.exec(setup); await db.exec(setup);
    await db.exec(await readFile(new URL('../../supabase/migrations/202610140010_approved_transfer_recipients.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/202610140011_employee_activity.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select count(*)::int as n from dm_employee_signup_allowlist')).rows[0].n,7);
    await db.exec('set role anon');
    await assert.rejects(db.query('select dm_activate_employee()'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await assert.rejects(db.query('select * from dm_employee_signup_allowlist'), /permission denied/);
    await assert.rejects(db.query('select dm_activate_employee()'), /Verify your work email/);
    await db.exec('reset role');
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[user]);
    const assigned = (await db.query("select id from dm_members where name='bhumika'")).rows[0].id;
    await db.exec('set role authenticated');
    assert.equal((await db.query('select dm_activate_employee() as id')).rows[0].id,assigned);
    assert.equal((await db.query('select dm_activate_employee() as id')).rows[0].id,assigned);
    // Six approved recipients have not signed up yet; they must still be selectable.
    const directory = (await db.query('select * from dm_employee_directory()')).rows;
    assert.equal(directory.length,7);
    const rahul = directory.find(person => person.name === 'rahul').id;
    const device = (await db.query("select * from dm_employee_add_device($1::jsonb)",[JSON.stringify({name:'Transfer test',model_name:'Pixel',platform:'Android',barcode:'PRE-SIGNUP-TRANSFER'})])).rows[0];
    await db.exec('reset role');
    const unapproved = (await db.query("insert into dm_members(name,team) values ('Unapproved','QA') returning id")).rows[0].id;
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select dm_employee_transfer($1,$2,$3)',[device.id,unapproved,device.version]), /another approved employee/);
    await db.query('select dm_employee_transfer($1,$2,$3)',[device.id,rahul,device.version]);
    assert.equal((await db.query('select * from dm_devices')).rows.length,0);
    const activity = (await db.query('select * from dm_audit_events order by created_at,id')).rows;
    assert.equal(activity.length,2);
    assert.ok(activity.some(event => /Transferred from bhumika.*to rahul/.test(event.action)));
    assert.ok(activity.every(event => Number.isFinite(new Date(event.created_at).getTime())));
    await assert.rejects(db.query("update dm_audit_events set actor='Forged'"), /permission denied/);
    assert.equal((await db.query('select count(*)::int as n from dm_employees')).rows[0].n,1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
    await assert.rejects(db.query('select dm_activate_employee()'), /awaiting administrator approval/);
    assert.equal((await db.query('select * from dm_employees')).rows.length,0);
    await assert.rejects(db.query('select * from dm_employee_directory()'), /Employee access required/);
    assert.equal((await db.query('select * from dm_audit_events')).rows.length,0);
    // After Rahul activates, the incoming transfer is visible but the sender's
    // unrelated registration event remains private.
    await db.exec('reset role');
    await db.query("update auth.users set email='rahul@equicomtech.com' where id=$1",[outsider]);
    await db.exec('set role authenticated');
    await db.query('select dm_activate_employee()');
    const incoming = (await db.query('select * from dm_audit_events')).rows;
    assert.equal(incoming.length,1);
    assert.match(incoming[0].action,/Transferred from bhumika.*to rahul/);
  } finally { await db.close(); }
});
