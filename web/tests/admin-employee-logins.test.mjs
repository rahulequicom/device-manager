import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('admin-only login creation links a person atomically, consumes its token and rejects forged or self-signup enrollment',async()=>{
 const db=new PGlite();
 const admin='10000000-0000-4000-8000-000000000001',outsider='10000000-0000-4000-8000-000000000002',employee='10000000-0000-4000-8000-000000000003',second='10000000-0000-4000-8000-000000000004';
 try{
  await db.exec(`create role anon;create role authenticated;create role signup_writer;create schema auth;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to anon,authenticated;
   grant usage on schema auth to signup_writer; grant insert on auth.users to signup_writer;
   insert into auth.users(id,email) values ('${admin}','admin@equicomtech.com'),('${outsider}','outside@equicomtech.com');`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  async function insertSignup(id,email,metadata={}) {
    await db.exec('set role signup_writer');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    try { return await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[id,email,JSON.stringify(metadata)]); }
    finally { await db.exec('reset role'); }
  }
  await db.query('insert into dm_admins(user_id) values ($1)',[admin]);
  const member=(await db.query("insert into dm_members(name,team,role) values ('Adnan','QA','QA Tester') returning id")).rows[0].id;
  await db.exec('set role anon');
  await assert.rejects(db.query("select dm_prepare_employee_login('adnan@equicomtech.com','Adnan','QA','QA Tester',null)"),/permission denied/);
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
  await assert.rejects(db.query("select dm_prepare_employee_login('adnan@equicomtech.com','Adnan','QA','QA Tester',null)"),/Admin access/);
  await assert.rejects(db.query('select dm_activate_employee()'),/Contact your admin/);
  await assert.rejects(db.query('select * from dm_admin_employee_logins()'),/Admin access/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await assert.rejects(db.query("select dm_prepare_employee_login('admin@equicomtech.com','Admin','QA','QA Tester',null)"),/already has a login/);
  await assert.rejects(db.query("select dm_prepare_employee_login('adnan@example.com','Adnan','QA','QA Tester',null)"),/work email/);
  await assert.rejects(db.query("select dm_prepare_employee_login('adnan@equicomtech.com','Adnan','QA','QA Tester',null)"),/existing row/);
  const token=(await db.query('select dm_prepare_employee_login($1,$2,$3,$4,$5) as token',['adnan@equicomtech.com','Adnan','QA','QA Tester',member])).rows[0].token;
  await assert.rejects(db.query('select * from dm_employee_login_requests'),/permission denied/);
  await db.exec('reset role');
  await assert.rejects(insertSignup(employee,'wrong@equicomtech.com',{dm_employee_login_token:token}),/expired/);
  assert.equal((await db.query('select count(*)::int as n from dm_employee_login_requests')).rows[0].n,1);
  await insertSignup(employee,'adnan@equicomtech.com',{dm_employee_login_token:token,role:'admin',member_id:'forged'});
  assert.equal((await db.query('select member_id from dm_employees where user_id=$1',[employee])).rows[0].member_id,member);
  assert.equal((await db.query('select count(*)::int as n from dm_members where id=$1',[member])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from dm_employee_login_requests')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from dm_admins')).rows[0].n,1);
  assert.ok((await db.query('select profile_completed_at from dm_employees where user_id=$1',[employee])).rows[0].profile_completed_at);
  await assert.rejects(insertSignup(second,'adnan2@equicomtech.com',{dm_employee_login_token:token}),/expired/);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[employee]);
  assert.equal((await db.query('select dm_activate_employee() as id')).rows[0].id,member);
  assert.equal((await db.query('select * from dm_devices')).rows.length,0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  assert.deepEqual((await db.query('select * from dm_admin_employee_logins()')).rows,[{member_id:member,email:'adnan@equicomtech.com'}]);
  const next=(await db.query("select dm_prepare_employee_login('new@equicomtech.com','New person','Mobile','Developer',null) as token")).rows[0].token;
  await db.exec('reset role');
  await db.query('update dm_employee_login_requests set expires_at=now()-interval \'1 second\' where id=$1',[next]);
  await assert.rejects(insertSignup(second,'new@equicomtech.com',{dm_employee_login_token:next}),/expired/);
  assert.equal((await db.query('select count(*)::int as n from auth.users where id=$1',[second])).rows[0].n,0);
  // Other apps may still create Auth users, but receive no inventory membership.
  await insertSignup(second,'new@equicomtech.com');
  assert.equal((await db.query('select count(*)::int as n from dm_employees where user_id=$1',[second])).rows[0].n,0);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  const fresh=(await db.query("select dm_prepare_employee_login('fresh@equicomtech.com','Fresh person','Design','Designer',null) as token")).rows[0].token;
  await db.exec('reset role');
  const freshId='10000000-0000-4000-8000-000000000005';
  await insertSignup(freshId,'fresh@equicomtech.com',{dm_employee_login_token:fresh});
  const freshMember=(await db.query('select m.name,m.team,m.role from dm_members m join dm_employees e on e.member_id=m.id where e.user_id=$1',[freshId])).rows[0];
  assert.deepEqual(freshMember,{name:'Fresh person',team:'Design',role:'Designer'});

 }finally{await db.close();}
});
