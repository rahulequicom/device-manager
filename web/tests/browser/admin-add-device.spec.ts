import { test, expect } from '@playwright/test';

test('admin registers a device with private specifications and can reopen them', async ({ page }) => {
  const user={id:'admin',email:'admin@example.test'};
  let device: Record<string, unknown> | null=null;
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url()); let body: unknown=[];
    if(url.pathname.endsWith('/token')) body={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
    else if(url.pathname.endsWith('/user')) body=user;
    else if(url.pathname.endsWith('/dm_admins')) body={user_id:user.id};
    else if(url.pathname.endsWith('/dm_devices')) {
      if(route.request().method()==='POST') {
        const input=route.request().postDataJSON();
        expect(input).toMatchObject({name:'QA Google phone',model_name:'Pixel 9',serial_number:'TEST-SERIAL',imei:'123456789012345',availability_confirmed:true});
        device={...input,id:'test-device',version:1,retired:false,holder_id:null,updated_at:new Date().toISOString()}; body=device;
      } else body=device?[device]:[];
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/admin?cloud=1');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Add device',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Add device',exact:true});
  await expect(dialog.getByLabel('Serial number',{exact:true})).toHaveAttribute('required','');
  await dialog.getByLabel('Platform',{exact:true}).click();
  await page.getByRole('option',{name:'Android',exact:true}).click();
  await dialog.getByLabel('Device name',{exact:true}).fill('QA Google phone');
  await dialog.getByLabel('Model',{exact:true}).fill('Pixel 9');
  await dialog.getByLabel('Serial number',{exact:true}).fill('TEST-SERIAL');
  await dialog.getByLabel('IMEI',{exact:true}).fill('123456789012345');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  if (test.info().project.name === 'mobile') await page.getByRole('button', { name: /QA Google phone TEST-SERIAL/ }).click();
  await page.getByRole('button',{name:'Device specifications',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('123456789012345');
  await page.screenshot({path:`/private/tmp/admin-add-device-${test.info().project.name}.png`});
});
