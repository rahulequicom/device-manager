import {test,expect} from '@playwright/test';
for (const existing of [true,false]) test(`admin creates a six-digit employee login ${existing?'for an existing person':'with a new person'} without changing admin session`,async({page})=>{
 const admin={id:'admin',email:'vishwateja@equicomtech.com'};
 const employee={id:'new-user',email:'adnan@equicomtech.com',identities:[{provider:'email'}]};
 const members=existing?[{id:'adnan',name:'Adnan',team:'QA',role:'QA Tester'}]:[];
 const token='20000000-0000-4000-8000-000000000001';
 let created=false;let prepares=0;let signups=0;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token')) body={access_token:'admin-access',refresh_token:'admin-refresh',expires_in:3600,token_type:'bearer',user:admin};
  else if(url.pathname.endsWith('/user'))body=admin;
  else if(url.pathname.endsWith('/settings'))body={disable_signup:false,mailer_autoconfirm:true};
  else if(url.pathname.endsWith('/dm_admins'))body={user_id:admin.id};
  else if(url.pathname.endsWith('/dm_members'))body=members;
  else if(url.pathname.endsWith('/dm_admin_employee_logins'))body=created?[{member_id:'adnan',email:employee.email}]:[];
  else if(url.pathname.endsWith('/dm_prepare_employee_login')){
   expect(route.request().headers().authorization).toBe('Bearer admin-access');
   expect(route.request().postDataJSON()).toMatchObject({p_email:employee.email,p_name:'Adnan',p_team:'QA',p_role:'QA Tester',p_member_id:existing?'adnan':null});
   expect(route.request().postDataJSON()).not.toHaveProperty('password');
   prepares++;body=token;
  }else if(url.pathname.endsWith('/signup')){
   expect(route.request().postDataJSON()).toMatchObject({email:employee.email,password:'012345',data:{dm_employee_login_token:token}});
   signups++;created=true;if(!existing)members.push({id:'adnan',name:'Adnan',team:'QA',role:'QA Tester'});
   body={access_token:'employee-access',refresh_token:'employee-refresh',expires_in:3600,token_type:'bearer',user:employee};
  }else if(url.pathname.endsWith('/logout')){
   expect(route.request().headers().authorization).toBe('Bearer employee-access');body={};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/admin?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(admin.email);
 await page.getByLabel('Password',{exact:true}).fill('admin-existing-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'People',exact:true}).click();
 if(existing)await page.getByRole('button',{name:'Create login',exact:true}).click();
 else await page.getByRole('button',{name:'Add person',exact:true}).click();
 const dialog=page.getByRole('dialog');
 if(!existing){
  await dialog.getByLabel('Full name',{exact:true}).fill('Adnan');
  await dialog.getByLabel('Role',{exact:true}).fill('QA Tester');
  await dialog.getByRole('combobox',{name:'Team',exact:true}).click();
  await page.getByRole('option',{name:'QA',exact:true}).click();
 }
 await dialog.getByLabel('Work email',{exact:true}).fill(employee.email);
 await dialog.getByLabel('Six-digit password',{exact:true}).fill('1234');
 expect(await dialog.getByLabel('Six-digit password',{exact:true}).evaluate((input:HTMLInputElement)=>input.checkValidity())).toBe(false);
 await dialog.getByLabel('Six-digit password',{exact:true}).fill('012345');
 await page.screenshot({path:`/private/tmp/admin-employee-login-${test.info().project.name}-${existing}.png`});
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByText(employee.email,{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create login',exact:true})).toHaveCount(0);
 expect(prepares).toBe(1);expect(signups).toBe(1);expect(members).toHaveLength(1);
 const session=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.endsWith('-auth-token')).map(([,value])=>JSON.parse(value)));
 expect(session).toHaveLength(1);expect(session[0].access_token).toBe('admin-access');
 expect(session[0].user.email).toBe(admin.email);
});
