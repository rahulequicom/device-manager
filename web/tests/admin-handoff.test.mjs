import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('admin handoff requires the new confirmed account and preserves former admin as a separate employee', async () => {
  const db = new PGlite();
  const oldId='10000000-0000-4000-8000-000000000001';
  const newId='10000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;
      insert into auth.users values ('${oldId}','bkatiyar197@gmail.com',now());`);
    for (const file of ['202610140001_device_register.sql','202610140003_ship_inventory.sql','202610140008_employee_portal.sql','202610140009_employee_signup.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
    await db.query('insert into dm_admins(user_id) values($1)',[oldId]);
    const script=await readFile(new URL('../../supabase/transfer-admin-to-arshad.sql',import.meta.url),'utf8');
    await assert.rejects(db.exec(script),/Create and confirm/); await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from dm_admins')).rows[0].n,1);
    await db.query('insert into auth.users values($1,$2,now())',[newId,'arshad@equicomtech.com']);
    await db.exec(script); await db.exec(script);
    assert.deepEqual((await db.query('select user_id from dm_admins')).rows,[{user_id:newId}]);
    const employee=(await db.query('select m.name,m.team from dm_employees e join dm_members m on m.id=e.member_id where e.user_id=$1',[oldId])).rows[0];
    assert.deepEqual(employee,{name:'Arshad',team:'QA'});
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[oldId]);
    assert.equal((await db.query('select dm_is_admin() as value')).rows[0].value,false);
    assert.equal((await db.query('select * from dm_devices')).rows.length,0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[newId]);
    assert.equal((await db.query('select * from dm_devices')).rows.length,12);
  } finally {await db.close();}
});
