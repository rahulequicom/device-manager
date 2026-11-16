import {test,expect} from '@playwright/test';

for(const stale of [false,true])test(`admin assigns from home cards${stale?' and handles a concurrent change':''}`,async({page})=>{
 const user={id:'admin',email:'admin@equicomtech.com'};
 const phone={id:'phone',name:'QA phone',holder_id:null as string|null,retired:false,version:3,availability_confirmed:false};
 let writes=0;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token'))body={access_token:'admin-access',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_admins'))body={user_id:user.id};
  else if(url.pathname.endsWith('/dm_employee_catalog'))body=[phone];
  else if(url.pathname.endsWith('/dm_employee_directory'))body=[{id:'alice',name:'Alice',team:'QA',role:'Tester',is_active:true},{id:'inactive',name:'Inactive',team:'QA',role:'Tester',is_active:false},{id:'deleted',name:'Deleted',team:'QA',deleted_at:'2026-11-16T00:00:00Z'}];
  else if(url.pathname.endsWith('/dm_devices')){
   expect(route.request().method()).toBe('PATCH');
   expect(route.request().headers().authorization).toBe('Bearer admin-access');
   expect(url.searchParams.get('id')).toBe('eq.phone');expect(url.searchParams.get('version')).toBe('eq.3');
   expect(route.request().postDataJSON()).toEqual({holder_id:'alice',availability_confirmed:true});writes++;
   if(stale)body=null;
   else{phone.holder_id='alice';phone.availability_confirmed=true;phone.version++;body=phone;}
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('admin-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 const card=page.locator('.home-device-card');
 await expect(card).toContainText('Not assigned');await expect(card).not.toContainText('Assigned to you');
 await card.getByRole('button',{name:'Assign',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Assign device');
 await expect(page.getByLabel('Assign to',{exact:true}).locator('option')).toHaveCount(2);
 await page.getByLabel('Assign to',{exact:true}).selectOption('alice');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(writes).toBe(0);
 await card.getByRole('button',{name:'Assign',exact:true}).click();
 await page.getByLabel('Assign to',{exact:true}).selectOption('alice');
 await page.getByRole('button',{name:'Confirm assignment',exact:true}).click();
 expect(writes).toBe(1);
 if(stale){await expect(page.getByRole('alert')).toContainText('Device changed. Refresh before assigning or transferring.');await expect(page.getByRole('dialog')).toBeVisible();}
 else{
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'Device assigned.'})).toContainText('Device assigned.');
  await page.getByRole('tab',{name:'Inventory',exact:true}).click();
  await expect(card).toContainText('Alice');await expect(card).toContainText('Assigned');
  await expect(card.getByRole('button',{name:'Transfer',exact:true})).toBeVisible();
  await expect(card.getByRole('button',{name:'Assign',exact:true})).toHaveCount(0);
  await page.screenshot({path:`/private/tmp/admin-home-assignment-${test.info().project.name}.png`});
 }
});
