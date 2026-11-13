import { test, expect } from '@playwright/test';

test('work email signup generates a temporary password, replaces it and opens assigned cloud devices', async ({ page }) => {
  const employeeId = '10000000-0000-4000-8000-000000000001';
  const user = { id: '20000000-0000-4000-8000-000000000001', email: 'bhumika@equicomtech.com', aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [{ provider: 'email' }], created_at: new Date().toISOString() };
  let temporary = ''; let replacement = ''; let activated = false;
  await page.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith('/signup')) {
      const input = route.request().postDataJSON();
      temporary = input.password;
      expect(input.email).toBe(user.email);
      expect(url.searchParams.get('redirect_to')).toBe('http://localhost:3000/signup');
      body = { ...user, email_confirmed_at: null };
    } else if (url.pathname.endsWith('/token')) {
      expect(route.request().postDataJSON().password).toBe(temporary);
      body = { access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user };
    } else if (url.pathname.endsWith('/user')) {
      if (route.request().method() === 'PUT') replacement = route.request().postDataJSON().password;
      body = user;
    } else if (url.pathname.endsWith('/dm_activate_employee')) {
      expect(replacement).toBe('New-private-password-123!');
      expect(replacement).not.toBe(temporary); activated = true; body = employeeId;
    } else if (url.pathname.endsWith('/dm_admins')) body = null;
    else if (url.pathname.endsWith('/dm_employees')) body = { member_id: employeeId };
    else if (url.pathname.endsWith('/dm_employee_directory')) body = [{ id: employeeId, name: 'Bhumika', team: 'QA', role: '' }];
    else if (url.pathname.endsWith('/dm_devices')) body = [{ id: 'cloud-device', name: 'My cloud phone', model_name: 'Pixel', platform: 'Android', holder_id: employeeId, barcode: 'CLOUD-1', retired: false, version: 1 }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/signup');
  await page.getByLabel('Work email', { exact: true }).fill(user.email);
  await page.getByRole('button', { name: 'Create employee account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your work email', exact: true })).toBeVisible();
  expect(temporary.length).toBeGreaterThan(40);
  await expect(page.getByLabel('Temporary password', { exact: true })).toHaveValue(temporary);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes(document.querySelector<HTMLInputElement>('[aria-label="Temporary password"]')!.value)))).toBe(false);
  await page.getByRole('button', { name: 'Email verified? Continue setup', exact: true }).click();
  await page.getByLabel('Temporary or existing password', { exact: true }).fill(temporary);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your password', exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('New-private-password-123!');
  await page.getByLabel('Confirm password', { exact: true }).fill('Not-the-same-password');
  await page.getByRole('button', { name: 'Save password and open devices', exact: true }).click();
  await expect(page.getByText('Passwords do not match.', { exact: true })).toBeVisible();
  expect(activated).toBe(false);
  await page.getByLabel('Confirm password', { exact: true }).fill('New-private-password-123!');
  await page.getByRole('button', { name: 'Save password and open devices', exact: true }).click();
  await expect(page).toHaveURL(/\?cloud=1$/);
  await expect(page.getByRole('heading', { name: 'My cloud phone', exact: true })).toBeVisible();
  await expect(page.getByText('Local development preview', { exact: true })).toHaveCount(0);
  expect(activated).toBe(true);
});

test('an existing admin can replace a temporary password and open the admin dashboard',async ({page})=>{
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
  await page.getByRole('button',{name:'Already registered? Continue setup',exact:true}).click();
  await page.getByLabel('Work email',{exact:true}).fill(user.email);
  await page.getByLabel('Temporary or existing password',{exact:true}).fill('test-temporary-password');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('New password',{exact:true}).fill('Private-new-password-123!');
  await page.getByLabel('Confirm password',{exact:true}).fill('Private-new-password-123!');
  await page.getByRole('button',{name:'Save password and open devices',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  expect(changed).toBe(true);expect(employeeActivation).toBe(false);
});
