import {test,expect} from '@playwright/test';

test('admin grants and revokes employee administration after confirming the scope',async({page})=>{
 const user={id:'admin',email:'admin@equicomtech.com'};
 const person={id:'employee',name:'Case Employee',team:'QA',role:'QA Tester',is_active:true,deleted_at:null};
 let granted=false;const changes:boolean[]=[];
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token'))body={access_token:'admin-access',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_admins'))body={user_id:user.id};
  else if(url.pathname.endsWith('/dm_members'))body=[person];
  else if(url.pathname.endsWith('/dm_admin_employee_logins'))body=[{member_id:person.id,email:'employee@equicomtech.com'}];
  else if(url.pathname.endsWith('/dm_admin_employee_access'))body=[{member_id:person.id,is_admin:granted,is_self:false}];
  else if(url.pathname.endsWith('/dm_admin_set_employee_admin')){
   expect(route.request().headers().authorization).toBe('Bearer admin-access');
   const input=route.request().postDataJSON();expect(input.p_member_id).toBe(person.id);
   granted=input.p_granted;changes.push(granted);body=null;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/admin?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('admin-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'People',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:person.name});
 await row.getByRole('button',{name:'Grant admin',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('full admin control');
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
 expect(changes).toEqual([]);
 await row.getByRole('button',{name:'Grant admin',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Grant admin',exact:true}).click();
 await expect(row.getByRole('button',{name:'Revoke admin',exact:true})).toBeVisible();
 await expect(row.getByRole('button',{name:'Deactivate',exact:true})).toBeDisabled();
 await expect(row.getByRole('button',{name:'Delete',exact:true})).toBeDisabled();
 await page.screenshot({path:`/private/tmp/admin-delegation-${test.info().project.name}.png`});
 await row.getByRole('button',{name:'Revoke admin',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Revoke admin',exact:true}).click();
 await expect(row.getByRole('button',{name:'Grant admin',exact:true})).toBeVisible();
 await expect(row.getByRole('button',{name:'Deactivate',exact:true})).toBeEnabled();
 expect(changes).toEqual([true,false]);
});
