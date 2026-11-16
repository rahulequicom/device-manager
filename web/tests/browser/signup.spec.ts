import {test,expect} from '@playwright/test';

test('old signup bookmarks show login with admin-provided credentials and no employee signup or reset',async({page})=>{
 await page.goto('/signup?cloud=1');
 await expect(page.getByRole('heading',{name:'Sign in to your register',exact:true})).toBeVisible();
 await expect(page.getByText('Employees: use the email and six-digit password provided by your admin.',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Create your account',exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Forgot your password?',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Create account',exact:true})).toHaveCount(0);
});

test('employee signs in with admin-created credentials and goes straight to self-assignment without password replacement',async({page})=>{
 const user={id:'employee',email:'adnan@equicomtech.com'};let changes=0;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token')){
   expect(route.request().postDataJSON()).toEqual({email:user.email,password:'012345',gotrue_meta_security:{}});
   body={access_token:'employee-access',refresh_token:'employee-refresh',expires_in:3600,token_type:'bearer',user};
  }else if(url.pathname.endsWith('/user')){if(route.request().method()==='PUT')changes++;body=user;}
  else if(url.pathname.endsWith('/dm_employees'))body={member_id:'adnan',profile_completed_at:'2026-11-16T00:00:00Z'};
  else if(url.pathname.endsWith('/dm_employee_catalog'))body=[{id:'phone',name:'QA phone',holder_id:null,retired:false,version:1,availability_confirmed:true}];
  else if(url.pathname.endsWith('/dm_employee_directory'))body=[{id:'adnan',name:'Adnan',team:'QA',role:'QA Tester'}];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByLabel('Password',{exact:true}).fill('012345');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Hello, Adnan.',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Assign to me',exact:true})).toBeVisible();
 expect(changes).toBe(0);
});

test('a login not linked by an admin cannot self-enroll into inventory',async({page})=>{
 const user={id:'unlinked',email:'unlinked@equicomtech.com'};let activations=0;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token'))body={access_token:'unlinked',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_activate_employee'))activations++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByLabel('Password',{exact:true}).fill('012345');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByText('Ask your admin to create your login and share your work email and six-digit password.',{exact:true})).toBeVisible();
 expect(activations).toBe(0);
});
