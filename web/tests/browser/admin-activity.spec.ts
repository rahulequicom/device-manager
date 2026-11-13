import { test, expect } from '@playwright/test';

test('admin activity includes different employees and devices, filters participants and shows precise IST times', async ({ page }) => {
  const user = { id:'admin',email:'admin@example.test' };
  const members = [{id:'rahul',name:'Rahul',team:'QA',role:''},{id:'raghu',name:'Raghu',team:'QA',role:''},{id:'shaina',name:'Shaina',team:'Design',role:''}];
  const events = [
    {id:'transfer',device_id:'phone',device_name:'Google phone',action:'Transferred from Rahul / QA to Raghu / QA',actor:'rahul@equicomtech.com',created_at:'2026-11-13T08:47:49Z',before_data:{holder_id:'rahul'},after_data:{holder_id:'raghu',barcode:'EQ-123',serial_number:'SERIAL-1'}},
    {id:'registration',device_id:'tablet',device_name:'Design tablet',action:'Device registered',actor:'shaina@equicomtech.com',created_at:'2026-11-13T08:40:02Z',before_data:null,after_data:{holder_id:'shaina',barcode:'EQ-456'}}
  ];
  await page.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url()); let body: unknown = [];
    if (url.pathname.endsWith('/token')) body = {access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
    else if (url.pathname.endsWith('/user')) body=user;
    else if (url.pathname.endsWith('/dm_admins')) body={user_id:user.id};
    else if (url.pathname.endsWith('/dm_members')) body=members;
    else if (url.pathname.endsWith('/dm_audit_events')) { expect(url.searchParams.has('device_id')).toBe(false); body=events; }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/admin?cloud=1');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('test-only-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Activity',exact:true}).click();
  await expect(page.getByRole('heading',{name:'All employee activity',exact:true})).toBeVisible();
  await expect(page.locator('.activity-entry')).toHaveCount(2);
  await expect(page.locator('.activity-entry time').first()).toContainText('13 Nov 2026, 02:17:49 pm');
  await expect(page.locator('.activity-entry time').first()).toHaveAttribute('datetime',events[0].created_at);
  await page.getByLabel('Filter by employee',{exact:true}).selectOption('raghu');
  await expect(page.locator('.activity-entry')).toHaveCount(1);
  await expect(page.getByText('Google phone',{exact:true})).toBeVisible();
  await page.getByLabel('Filter by employee',{exact:true}).selectOption('shaina');
  await expect(page.getByText('Design tablet',{exact:true})).toBeVisible();
  await page.getByLabel('Filter by employee',{exact:true}).selectOption('');
  await page.getByLabel('Search activity',{exact:true}).fill('SERIAL-1');
  await expect(page.locator('.activity-entry')).toHaveCount(1);
  await page.getByLabel('Search activity',{exact:true}).fill('');
  await expect(page.locator('.activity-entry')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:`/private/tmp/admin-activity-${test.info().project.name}.png`,fullPage:true});
});
