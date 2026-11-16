import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('reviewed employee reset preserves admins, devices/history and aborts for shared-app data or storage',async()=>{
 const db=new PGlite();
 const rahul='3f6ff249-483f-4fd0-a607-1f43fc3eb84d',bhumika='fd753074-8b53-475f-a8d2-83291eae8df6';
 const arshad='7866dbba-7d1e-425b-8218-3823b01a4a56',vish='9d99df23-d097-4c87-9470-f2a7deb96a8e',other='10000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create table storage.objects(owner_id text);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to anon,authenticated;
   insert into auth.users values ('${rahul}','rahul@equicomtech.com',now()),('${bhumika}','bkatiyar197@gmail.com',now()),('${arshad}','arshad@equicomtech.com',now()),('${vish}','vishwateja@equicomtech.com',now()),('${other}','other@example.test',now());`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  await db.query('insert into dm_admins(user_id) values ($1),($2)',[arshad,vish]);
  const emails=['bhumika@equicomtech.com','bkatiyar197@gmail.com','praveen@equicomtech.com','priyadarshini@equicomtech.com','raghu@equicomtech.com','rahul@equicomtech.com','shaina@equicomtech.com','yajna@equicomtech.com'];
  const ids=[];
  for(const email of emails){const id=(await db.query("insert into dm_members(name,team) values ($1,'QA') returning id",[email])).rows[0].id;ids.push(id);await db.query('insert into dm_employee_signup_allowlist values ($1,$2)',[email,id]);}
  await db.query('insert into dm_employees(user_id,member_id) values ($1,$2),($3,$4)',[rahul,ids[5],bhumika,ids[1]]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[rahul]);
  await db.query('update dm_devices set holder_id=$1 where id in(select id from dm_devices order by id limit 3)',[ids[4]]);
  const before=(await db.query('select count(*)::int as n from dm_audit_events')).rows[0].n;
  const reset=await readFile(new URL('../../supabase/reset-employee-enrollment.sql',import.meta.url),'utf8');
  async function run(){try{await db.exec(reset);}catch(error){await db.exec('rollback');throw error;}}
  await db.exec('create table other_app(user_id uuid references auth.users(id) on delete cascade)');
  await db.query('insert into other_app values ($1)',[rahul]);
  await assert.rejects(run(),/Another application/);
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,5);
  await db.exec('delete from other_app');
  await db.query('insert into storage.objects values ($1)',[rahul]);
  await assert.rejects(run(),/storage objects/);
  await db.exec('delete from storage.objects');
  await db.query('insert into dm_admins(user_id) values ($1)',[rahul]);
  await assert.rejects(run(),/Admin preservation/);
  await db.query('delete from dm_admins where user_id=$1',[rahul]);
  await run();
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,3);
  assert.equal((await db.query('select count(*)::int as n from dm_admins')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int as n from dm_devices')).rows[0].n,12);
  assert.equal((await db.query('select count(*)::int as n from dm_devices where holder_id is not null')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from dm_audit_events')).rows[0].n,before+3);
  assert.equal((await db.query('select count(*)::int as n from dm_employee_signup_allowlist')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from dm_employees')).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int as n from dm_audit_events where actor='rahul@equicomtech.com' and actor_id is null")).rows[0].n,6);
  await assert.rejects(run(),/already reset/);
 }finally{await db.close();}
});
