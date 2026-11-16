import {test,expect} from '@playwright/test';
test('admin cancels then removes an incorrect assignment from inventory',async({page})=>{
 const user={id:'admin',email:'admin@equicomtech.com'};let writes=0;
 const device={id:'phone',name:'Test phone',barcode:'EQ-1',serial_number:'SERIAL',platform:'android',holder_id:'employee' as string|null,version:1,availability_confirmed:true,retired:false};
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token'))body={access_token:'admin-access',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_admins'))body={user_id:user.id};
  else if(url.pathname.endsWith('/dm_members'))body=[{id:'employee',name:'Alice',team:'QA',role:'Tester',is_active:true}];
  else if(url.pathname.endsWith('/dm_devices')){
   if(route.request().method()==='PATCH'){
    expect(url.searchParams.get('version')).toBe('eq.1');expect(route.request().postDataJSON()).toEqual({holder_id:null,availability_confirmed:true});writes++;device.holder_id=null;device.version++;body=device;
   }else body=[device];
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/admin?cloud=1');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('admin-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 const actions=page.locator('.person-actions:visible').first();
 await expect(actions.getByRole('button',{name:'Transfer',exact:true})).toBeVisible();
 await actions.getByRole('button',{name:'Delete assignment',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();expect(writes).toBe(0);
 await actions.getByRole('button',{name:'Delete assignment',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Delete assignment',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);expect(writes).toBe(1);
 await expect(page.getByRole('button',{name:'Delete assignment',exact:true})).toHaveCount(0);
});
