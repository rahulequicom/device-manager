import { test, expect } from '@playwright/test';

test('signup uses the chosen password and verified employees open their devices without password replacement', async ({ page }) => {
  const memberId='10000000-0000-4000-8000-000000000001';
  const user={id:'20000000-0000-4000-8000-000000000001',email:'bhumika@equicomtech.com',aud:'authenticated',role:'authenticated',identities:[{provider:'email'}]};
  let passwordUpdates=0;let activated=false;
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());let body:unknown=[];
    if(url.pathname.endsWith('/signup')){
      const input=route.request().postDataJSON();expect(input.password).toBe('482915');expect(input.email).toBe(user.email);
      expect(url.searchParams.get('redirect_to')).toBe('http://localhost:3000/signup');body=user;
    }else if(url.pathname.endsWith('/token')){
      expect(route.request().postDataJSON().password).toBe('482915');
      body={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
    }else if(url.pathname.endsWith('/user')){if(route.request().method()==='PUT')passwordUpdates++;body=user;}
    else if(url.pathname.endsWith('/dm_admins'))body=null;
    else if(url.pathname.endsWith('/dm_activate_employee')){activated=true;body=memberId;}
    else if(url.pathname.endsWith('/dm_employees'))body={member_id:memberId};
    else if(url.pathname.endsWith('/dm_employee_directory'))body=[{id:memberId,name:'Bhumika',team:'QA',role:''}];
    else if(url.pathname.endsWith('/dm_devices'))body=[{id:'device',name:'My cloud phone',model_name:'Pixel',platform:'Android',holder_id:memberId,barcode:'EQ-1',retired:false,version:1}];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/signup');
  await page.getByLabel('Work email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('1234');
  expect(await page.getByLabel('Password',{exact:true}).evaluate((input:HTMLInputElement)=>input.checkValidity())).toBe(false);
  await page.getByLabel('Password',{exact:true}).fill('482915');
  await page.getByLabel('Confirm password',{exact:true}).fill('482916');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByText('Passwords do not match.',{exact:true})).toBeVisible();
  await page.getByLabel('Confirm password',{exact:true}).fill('482915');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Verify your work email',exact:true})).toBeVisible();
  await expect(page.getByLabel('Temporary password',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Email verified? Sign in',exact:true}).click();
  await page.getByLabel('Password',{exact:true}).fill('482915');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Continue to workspace',exact:true}).click();
  await expect(page).toHaveURL(/\?cloud=1$/);
  await expect(page.getByRole('heading',{name:'My cloud phone',exact:true})).toBeVisible();
  expect(activated).toBe(true);expect(passwordUpdates).toBe(0);
});

test('existing admin signs in with an existing password and opens admin without employee activation',async ({page})=>{
  const user={id:'admin-arshad',email:'arshad@example.test'};
  let changed=false;let employeeActivation=false;
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());let body:unknown=[];
    if(url.pathname.endsWith('/token')) body={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
    else if(url.pathname.endsWith('/user')){if(route.request().method()==='PUT')changed=true;body=user;}
    else if(url.pathname.endsWith('/dm_admins'))body={user_id:user.id};
    else if(url.pathname.endsWith('/dm_activate_employee'))employeeActivation=true;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/signup');
  await page.getByRole('button',{name:'Already registered? Sign in',exact:true}).click();
  await page.getByLabel('Work email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('Existing-admin-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Continue to workspace',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  expect(changed).toBe(false);expect(employeeActivation).toBe(false);
});

test('login links directly to recovery and requests the app callback without changing the password',async ({page})=>{
  let requests=0;let changes=0;
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/recover')){requests++;expect(route.request().postDataJSON().email).toBe('arshad@example.test');expect(url.searchParams.get('redirect_to')).toBe('http://localhost:3000/signup');}
    if(url.pathname.endsWith('/user')&&route.request().method()==='PUT')changes++;
    await route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await page.goto('/admin?cloud=1');
  await page.getByRole('link',{name:'Forgot your password?',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Reset your password',exact:true})).toBeVisible();
  await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
  await page.getByLabel('Work email',{exact:true}).fill('arshad@example.test');
  await page.getByRole('button',{name:'Send reset email',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Your password is unchanged until you save a new one.');
  expect(requests).toBe(1);expect(changes).toBe(0);
});

test('a recovery callback opens new-password entry and saves only after user submission',async ({page})=>{
  const user={id:'reset-admin',email:'arshad@example.test'};
  const jwt=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,email:user.email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),Buffer.from('test-signature').toString('base64url')].join('.');
  let updates=0;
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());let body:unknown=[];
    if(url.pathname.endsWith('/user')){if(route.request().method()==='PUT'){expect(route.request().postDataJSON().password).toBe('482915');updates++;}body=user;}
    else if(url.pathname.endsWith('/dm_admins'))body={user_id:user.id};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`/signup#access_token=${jwt}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery`);
  await expect(page.getByRole('heading',{name:'Reset your password',exact:true})).toBeVisible();
  await page.getByLabel('New password',{exact:true}).fill('482915');
  await page.getByLabel('Confirm password',{exact:true}).fill('482915');
  expect(updates).toBe(0);
  await page.getByRole('button',{name:'Save password and continue',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  expect(updates).toBe(1);
});
