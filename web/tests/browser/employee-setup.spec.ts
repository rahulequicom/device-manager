import {test,expect} from '@playwright/test';

for (const hasMobile of [true,false]) test(`first login selects team and role${hasMobile?' and current mobile':' without a mobile yet'}`,async({page})=>{
 const user={id:'employee-new',email:'alice@equicomtech.com'};
 const member={id:'alice',name:'alice@equicomtech.com',team:'Unassigned',role:''};
 const devices=[{id:'pixel',name:'QA Pixel',holder_id:null as string|null,retired:false,version:1,availability_confirmed:false},{id:'held',name:'Occupied iPhone',holder_id:'bob',retired:false,version:3,availability_confirmed:true}];
 let completed=false;let saves=0;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token')) body={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_employees'))body={member_id:member.id,profile_completed_at:completed?'2026-11-16T00:00:00Z':null};
  else if(url.pathname.endsWith('/dm_employee_catalog'))body=devices;
  else if(url.pathname.endsWith('/dm_employee_directory'))body=[member,{id:'bob',name:'Bob',team:'QA',role:'Developer'}];
  else if(url.pathname.endsWith('/dm_employee_save_profile')){
   expect(route.request().postDataJSON()).toEqual({p_team:'QA',p_role:'QA Tester',p_device_id:hasMobile?'pixel':null,p_version:hasMobile?1:null});
   saves++;completed=true;member.team='QA';member.role='QA Tester';if(hasMobile){devices[0].holder_id='alice';devices[0].version++;}body=null;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByLabel('Password',{exact:true}).fill('482915');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your team and mobile',exact:true})).toBeVisible();
 await expect(page.getByLabel('Mobile you have').locator('option')).toHaveCount(2);
 await page.getByLabel('Team',{exact:true}).selectOption('QA');
 await page.getByLabel('Role',{exact:true}).selectOption('QA Tester');
 if(hasMobile)await page.getByLabel('Mobile you have').selectOption('pixel');
 await page.screenshot({path:`/private/tmp/employee-setup-${test.info().project.name}-${hasMobile}.png`});
 await page.getByRole('button',{name:'Save and continue',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Hello, alice.',exact:true})).toBeVisible();
 if(hasMobile)await expect(page.locator('.home-device-card').filter({hasText:'QA Pixel'})).toContainText('Assigned to you');
 expect(saves).toBe(1);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Hello, alice.',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Your team and mobile',exact:true})).toHaveCount(0);
});
