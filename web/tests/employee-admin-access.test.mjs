import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('only admins delegate active employee access; revocation is immediate and self changes are blocked',async()=>{
 const db=new PGlite();
 const admin='10000000-0000-4000-8000-000000000001',employee='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;
   insert into auth.users(id,email) values('${admin}','admin@equicomtech.com'),('${employee}','employee@equicomtech.com');`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  await db.query('insert into dm_admins(user_id) values($1)',[admin]);
  const members=(await db.query("insert into dm_members(name,team,role) values('Owner','QA','Lead'),('Employee','QA','Tester'),('No login','QA','Tester') returning id")).rows;
  await db.query('insert into dm_employees(user_id,member_id) values($1,$2),($3,$4)',[admin,members[0].id,employee,members[1].id]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select dm_admin_set_employee_admin($1,true)',[members[1].id]),/permission denied/);
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[employee]);
  await assert.rejects(db.query('select dm_admin_set_employee_admin($1,true)',[members[1].id]),/Admin access/);
  await assert.rejects(db.query('select * from dm_admin_employee_access()'),/Admin access/);
  await assert.rejects(db.query('insert into dm_admins(user_id) values($1)',[employee]),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await assert.rejects(db.query('select dm_admin_set_employee_admin($1,false)',[members[0].id]),/own admin/);
  await assert.rejects(db.query('select dm_admin_set_employee_admin($1,true)',[members[2].id]),/login first/);
  await db.query("select dm_admin_set_person_state($1,'deactivate')",[members[1].id]);
  await assert.rejects(db.query('select dm_admin_set_employee_admin($1,true)',[members[1].id]),/Activate or restore/);
  await db.query("select dm_admin_set_person_state($1,'activate')",[members[1].id]);
  await db.query('select dm_admin_set_employee_admin($1,true)',[members[1].id]);
  await db.query('select dm_admin_set_employee_admin($1,true)',[members[1].id]);
  assert.equal((await db.query('select count(*)::int n from dm_admin_access_events')).rows[0].n,1);
  assert.equal((await db.query('select * from dm_admin_employee_access()')).rows.find(x=>x.member_id===members[1].id).is_admin,true);
  await assert.rejects(db.query("select dm_admin_set_person_state($1,'delete')",[members[1].id]),/protected/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[employee]);
  assert.equal((await db.query('select dm_is_admin() as allowed')).rows[0].allowed,true);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await db.query('select dm_admin_set_employee_admin($1,false)',[members[1].id]);
  assert.equal((await db.query('select count(*)::int n from dm_admin_access_events')).rows[0].n,2);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[employee]);
  assert.equal((await db.query('select dm_is_admin() as allowed')).rows[0].allowed,false);
  assert.equal((await db.query('select dm_employee_member_id() as id')).rows[0].id,members[1].id);
  await assert.rejects(db.query('select dm_admin_set_employee_admin($1,true)',[members[1].id]),/Admin access/);
  assert.equal((await db.query('select * from dm_admin_access_events')).rows.length,0);
 }finally{await db.close();}
});

test('reviewed Arshad reset preserves another admin and aborts on shared-app data',async()=>{
 const db=new PGlite();const target='7866dbba-7d1e-425b-8218-3823b01a4a56',owner='10000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;
   insert into auth.users(id,email) values('${owner}','owner@equicomtech.com'),('${target}','arshad@equicomtech.com');`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  await db.query('insert into dm_admins(user_id) values($1)',[target]);
  const reset=await readFile(new URL('../../supabase/reset-arshad-login.sql',import.meta.url),'utf8');
  await assert.rejects(db.exec(reset),/Another admin/);await db.exec('rollback');
  await db.query('insert into dm_admins(user_id) values($1)',[owner]);
  await db.exec('create table public.other_app(user_id uuid references auth.users(id) on delete cascade)');
  await db.query('insert into other_app values($1)',[target]);
  await assert.rejects(db.exec(reset),/Related data/);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2);
  await db.exec('delete from other_app');
  const devices=(await db.query('select count(*)::int n from dm_devices')).rows[0].n;
  const audits=(await db.query('select count(*)::int n from dm_audit_events')).rows[0].n;
  await db.exec(reset);
  assert.deepEqual((await db.query('select user_id from dm_admins')).rows,[{user_id:owner}]);
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[target])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from dm_devices')).rows[0].n,devices);
  assert.equal((await db.query('select count(*)::int n from dm_audit_events')).rows[0].n,audits);
  await assert.rejects(db.exec(reset),/already deleted/);await db.exec('rollback');
 }finally{await db.close();}
});
