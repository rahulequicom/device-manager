import {test,expect} from '@playwright/test';

test('admin activates, deactivates, deletes and restores People without losing login details',async({page})=>{
 const user={id:'admin',email:'admin@equicomtech.com'};
 const person={id:'employee',name:'Case Employee',team:'QA',role:'QA Tester',is_active:true,deleted_at:null as string|null};
 const actions:string[]=[];
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token'))body={access_token:'admin-access',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_admins'))body={user_id:user.id};
  else if(url.pathname.endsWith('/dm_members'))body=[person];
  else if(url.pathname.endsWith('/dm_admin_employee_logins'))body=[{member_id:person.id,email:'employee@equicomtech.com'}];
  else if(url.pathname.endsWith('/dm_admin_set_person_state')){
   expect(route.request().headers().authorization).toBe('Bearer admin-access');
   const input=route.request().postDataJSON();expect(input.p_member_id).toBe(person.id);actions.push(input.p_action);
   if(input.p_action==='delete'){person.deleted_at=new Date().toISOString();person.is_active=false;}
   else if(input.p_action==='restore'){person.deleted_at=null;person.is_active=true;}
   else person.is_active=input.p_action==='activate';
   body=null;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/admin?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('admin-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'People',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:'Case Employee'});
 await row.getByRole('button',{name:'Deactivate',exact:true}).click();
 await expect(row.getByText('Deactivated',{exact:true})).toBeVisible();
 await row.getByRole('button',{name:'Activate',exact:true}).click();
 await expect(row.getByText('Active',{exact:true})).toBeVisible();
 await row.getByRole('button',{name:'Delete',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
 expect(actions).toEqual(['deactivate','activate']);
 await row.getByRole('button',{name:'Delete',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Delete person',exact:true}).click();
 await expect(row).toHaveCount(0);
 await page.getByLabel('Show deleted people',{exact:true}).check();
 await expect(row.getByText('Deleted',{exact:true})).toBeVisible();
 await row.getByRole('button',{name:'Restore',exact:true}).click();
 await expect(row.getByText('Active',{exact:true})).toBeVisible();
 await expect(row.getByText('employee@equicomtech.com',{exact:true})).toBeVisible();
 expect(actions).toEqual(['deactivate','activate','delete','restore']);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/private/tmp/people-status-${test.info().project.name}.png`});
});

for(const deleted of [false,true])test(`${deleted?'deleted':'deactivated'} employee cannot open inventory even with a valid sign-in session`,async({page})=>{
 const user={id:'employee',email:'employee@equicomtech.com'};let catalogs=0;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token'))body={access_token:'employee-access',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_employee_access'))body={member_id:'employee',is_active:false,deleted_at:deleted?new Date().toISOString():null,profile_completed_at:new Date().toISOString()};
  else if(url.pathname.endsWith('/dm_employee_catalog'))catalogs++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('482915');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByText(deleted?'Your employee access has been removed. Contact your admin.':'Your employee account is deactivated. Contact your admin.',{exact:true})).toBeVisible();
 expect(catalogs).toBe(0);
});
