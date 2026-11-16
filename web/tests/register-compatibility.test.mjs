import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

async function register(accessError) {
 const source=(await readFile(new URL('../src/lib/register-api.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const client={
  rpc:async(name)=>name==='dm_admin_employee_access'?{data:null,error:accessError}:{data:name==='dm_admin_employee_logins'?[{member_id:'person',email:'person@equicomtech.com'}]:null,error:null},
  from:(table)=>({select:()=>({order:()=>({range:async()=>({data:[{id:table}],error:null})})})})
 };
 const js=stripTypeScriptTypes(source).replace(/export /g,'');
 return new Function('getSupabase','isLocalInventory',js+'; return loadRegister();')(()=>client,()=>false);
}
for(const code of ['PGRST202','42883'])test(`register loads when optional delegation RPC is unavailable (${code})`,async()=>{
 const data=await register({code,message:'missing function'});
 assert.deepEqual(data.employeeAccess,[]);
 assert.equal(data.devices[0].id,'dm_devices');
 assert.equal(data.members[0].id,'dm_members');
 assert.equal(data.employeeLogins[0].member_id,'person');
});
test('register preserves permission and network failures from optional lookup',async()=>{
 for(const code of ['42501','NETWORK']) {
  const error={code,message:'failure'};
  await assert.rejects(register(error),value=>value===error);
 }
});
