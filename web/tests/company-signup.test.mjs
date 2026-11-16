import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('company signup enrolls unverified accounts, preserves employee links and cannot grant admin or claim unrelated records',async()=>{
 const db=new PGlite();
 const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004'];
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to anon,authenticated;
   insert into auth.users values ('${ids[0]}','BHUMIKA@equicomtech.com',null),('${ids[1]}','new.person@equicomtech.com',null),('${ids[2]}','outside@example.com',now()),('${ids[3]}','other@equicomtech.com.evil.test',now());`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(x=>x.endsWith('.sql') && x < '202610140014').sort()) await db.exec(await readFile(new URL(file,folder),'utf8'));
  const known=(await db.query("insert into dm_members(name,team) values ('Bhumika','Design') returning id")).rows[0].id;
  const unrelated=(await db.query("insert into dm_members(name,team) values ('new.person','Unassigned') returning id")).rows[0].id;
  await db.query("insert into dm_employee_signup_allowlist values ('bhumika@equicomtech.com',$1)",[known]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select dm_activate_employee()'),/permission denied/);
  await db.exec('reset role;set role authenticated');
  await assert.rejects(db.query('select dm_activate_employee()'),/Sign in/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[0]]);
  assert.equal((await db.query('select dm_activate_employee() as id')).rows[0].id,known);
  assert.equal((await db.query('select dm_activate_employee() as id')).rows[0].id,known);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[1]]);
  const newId=(await db.query('select dm_activate_employee() as id')).rows[0].id;
  assert.notEqual(newId,unrelated);
  assert.equal((await db.query('select dm_activate_employee() as id')).rows[0].id,newId);
  assert.equal((await db.query('select * from dm_admins')).rows.length,0);
  await assert.rejects(db.query('insert into dm_admins(user_id) values ($1)',[ids[1]]),/permission denied/);
  assert.equal((await db.query('select * from dm_devices')).rows.length,0);
  assert.equal((await db.query('select * from dm_employee_catalog()')).rows.length,12);
  for(const id of ids.slice(2)) {
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
   await assert.rejects(db.query('select dm_activate_employee()'),/@equicomtech.com/);
  }
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from dm_employees')).rows[0].n,2);
  assert.equal((await db.query('select team from dm_members where id=$1',[newId])).rows[0].team,'Unassigned');
 } finally {await db.close();}
});
