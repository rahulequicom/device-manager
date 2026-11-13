import { test, expect } from "@playwright/test";

test('employee catalog hides specifications, self assigns available devices and transfers', async ({ page }) => {
  const key = 'device-manager-local-inventory-v1';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your devices, in one place.' })).toBeVisible();
  await expect.poll(() => page.evaluate(key => !!localStorage.getItem(key), key)).toBe(true);
  await page.evaluate(key => {
    const value = JSON.parse(localStorage.getItem(key)!);
    value.members = [{ id: 'alice', name: 'Alice Example', team: 'QA', role: 'Tester' }, { id: 'bob', name: 'Bob Example', team: 'Mobile', role: 'Developer' }];
    value.devices[0].holder_id = 'alice'; value.devices[1].holder_id = 'bob'; value.devices[2].availability_confirmed = true;
    localStorage.setItem(key, JSON.stringify(value));
  }, key);
  await page.reload();
  await page.getByLabel('Preview as', { exact: true }).selectOption('alice');
  await expect(page.getByRole('heading', { name: 'Hello, Alice.' })).toBeVisible();
  await expect(page.locator('.home-device-card')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Add a device', exact: true })).toHaveCount(0);
  await expect(page.getByText('Serial number', { exact: true })).toHaveCount(0);
  const card = page.locator('.home-device-card').nth(2);
  await card.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await expect(card).toContainText('Assigned to you');
  await card.getByRole('button', { name: 'Transfer', exact: true }).click();
  await page.getByLabel('Transfer to', { exact: true }).selectOption('bob');
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('heading', { name: 'Transferred from Alice Example to Bob Example', exact: true })).toBeVisible();
  await expect(page.getByText('Local coordinator', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.activity-entry time').first()).toContainText('IST');
  const recorded = await page.locator('.activity-entry time').first().getAttribute('datetime');
  expect(Number.isFinite(new Date(recorded!).getTime())).toBe(true);
  await page.getByLabel('Preview as', { exact: true }).selectOption('bob');
  await expect(card).toBeVisible();
  await expect(page.locator('.home-device-card')).toHaveCount(12);
  await expect(card).toContainText('Assigned to you');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/private/tmp/employee-home-${test.info().project.name}.png`, fullPage: true });
});

test('transfer explains an empty recipient list and disables confirmation', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('device-manager-local-inventory-v1'))).toBe(true);
  await page.evaluate(() => {
    const key = 'device-manager-local-inventory-v1';
    const value = JSON.parse(localStorage.getItem(key)!);
    value.members = [{ id: 'solo', name: 'Only employee', team: 'QA', role: '' }];
    value.devices[0].holder_id = 'solo';
    localStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();
  await page.getByLabel('Preview as', { exact: true }).selectOption('solo');
  await page.locator('.home-device-card').first().getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(page.getByText(/No other approved employees are available/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm transfer', exact: true })).toBeDisabled();
});

test('cloud employee uses safe catalog and action RPCs without reading specification tables', async ({ page }) => {
  const user={id:'employee',email:'employee@example.test'};
  const devices=[{id:'available',name:'QA phone',holder_id:null as string | null,retired:false,version:1,availability_confirmed:true}];
  let claims=0;
  await page.route('https://*.supabase.co/**', async route=>{
    const url=new URL(route.request().url()); let body: unknown=[];
    expect(url.pathname).not.toMatch(/\/dm_devices$|\/dm_audit_events$/);
    if(url.pathname.endsWith('/token')) body={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
    else if(url.pathname.endsWith('/user')) body=user;
    else if(url.pathname.endsWith('/dm_employees')) body={member_id:'alice'};
    else if(url.pathname.endsWith('/dm_employee_directory')) body=[{id:'alice',name:'Alice',team:'QA',role:''},{id:'bob',name:'Bob',team:'QA',role:''}];
    else if(url.pathname.endsWith('/dm_employee_catalog')) body=devices;
    else if(url.pathname.endsWith('/dm_employee_self_assign')) {
      expect(route.request().postDataJSON()).toEqual({p_device_id:'available',p_version:1});
      claims++; devices[0].holder_id='alice'; devices[0].version++;
      body=null;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/?cloud=1');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Assign to me',exact:true}).click();
  await expect(page.locator('.home-device-card')).toContainText('Assigned to you');
  expect(claims).toBe(1);
  await expect(page.getByText('Serial number',{exact:true})).toHaveCount(0);
});
