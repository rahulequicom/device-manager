import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const policy=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await readFile(new URL('../src/lib/password-policy.ts',import.meta.url),'utf8'))).toString('base64'));
let source=await readFile(new URL('../src/lib/admin-employees.ts',import.meta.url),'utf8');
source=source.replace(/^import .* from .*;\n/gm,'').replace('export type EmployeeLoginInput =','type EmployeeLoginInput =');
source='const newPasswordError = globalThis.employeePolicy;\n'+stripTypeScriptTypes(source);
globalThis.employeePolicy=policy.newPasswordError;
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('employee provisioner preserves leading zeros, keeps the password out of profile RPCs and never signs up on the admin client',async()=>{
 const calls=[];const token='20000000-0000-4000-8000-000000000001';
 const admin={rpc:async(name,input)=>{calls.push({name,input});return{data:token};},auth:{signUp:()=>{throw Error('Admin session changed');}}};
 const signup={auth:{signUp:async input=>{calls.push({signup:input});return{data:{user:{id:'new',identities:[{}]},session:{access_token:'employee'}}};}}};
 const input={name:'Adnan',email:' ADNAN@equicomtech.com ',password:'012345',team:'QA',role:'QA Tester',memberId:'member'};
 assert.deepEqual(await api.provisionEmployeeLogin(admin,signup,input),{email:'adnan@equicomtech.com',userId:'new'});
 assert.equal('password' in calls[0].input,false);
 assert.equal(calls[1].signup.password,'012345');
 assert.deepEqual(calls[1].signup.options.data,{dm_employee_login_token:token});
 await assert.rejects(api.provisionEmployeeLogin(admin,signup,{...input,password:'1234'}),/six digits/);
 await assert.rejects(api.provisionEmployeeLogin({rpc:async()=>({error:new Error('already has a login')})},signup,input),/already has a login/);
 assert.equal(calls.length,2);
});
