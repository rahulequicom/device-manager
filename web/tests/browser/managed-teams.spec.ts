import {test,expect} from '@playwright/test';

test('admin adds and renames teams inside Add person without submitting a login, and sees names in filters',async({page})=>{
 const user={id:'admin',email:'admin@equicomtech.com'};let teams=['Mobile','QA','Design'];let loginAttempts=0;const changes:unknown[]=[];
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.endsWith('/token'))body={access_token:'admin-access',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/user'))body=user;
  else if(url.pathname.endsWith('/dm_admins'))body={user_id:user.id};
  else if(url.pathname.endsWith('/dm_teams'))body=teams.map(name=>({name}));
  else if(url.pathname.endsWith('/dm_admin_save_team')){
   const input=route.request().postDataJSON();changes.push(input);
   expect(route.request().headers().authorization).toBe('Bearer admin-access');
   if(input.p_previous_name)teams=teams.map(name=>name===input.p_previous_name?input.p_name:name);
   else teams.push(input.p_name);body=input.p_name;
  }
  else if(url.pathname.endsWith('/dm_prepare_employee_login'))loginAttempts++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/admin?cloud=1');
 await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('admin-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'People',exact:true}).click();
 await page.getByRole('button',{name:'Add person',exact:true}).click();
 await page.getByLabel('Full name',{exact:true}).fill('New Employee');
 await page.getByRole('dialog').getByRole('button',{name:'Manage teams',exact:true}).click();
 const manager=page.getByRole('dialog',{name:'Manage teams',exact:true});
 await manager.getByLabel('Team name',{exact:true}).fill('Customer Support');
 await manager.getByRole('button',{name:'Add team',exact:true}).click();
 await expect(manager.getByRole('button',{name:'Rename Customer Support',exact:true})).toBeVisible();
 await manager.getByRole('button',{name:'Done',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Add person',exact:true});
 await expect(editor.getByLabel('Team',{exact:true})).toContainText('Customer Support');
 await expect(editor.getByLabel('Full name',{exact:true})).toHaveValue('New Employee');
 expect(loginAttempts).toBe(0);
 await editor.getByRole('button',{name:'Manage teams',exact:true}).click();
 await manager.getByRole('button',{name:'Rename Customer Support',exact:true}).click();
 await manager.getByLabel('Team name',{exact:true}).fill('Client Services');
 await manager.getByRole('button',{name:'Save team name',exact:true}).click();
 await expect(manager.getByRole('button',{name:'Rename Client Services',exact:true})).toBeVisible();
 await page.screenshot({path:`/private/tmp/managed-teams-${test.info().project.name}.png`});
 await manager.getByRole('button',{name:'Done',exact:true}).click();
 await expect(editor.getByLabel('Team',{exact:true})).toContainText('Client Services');
 await editor.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Inventory',exact:true}).click();
 await page.getByLabel('Team',{exact:true}).click();
 await expect(page.getByRole('option',{name:'Client Services',exact:true})).toBeVisible();
 expect(changes).toEqual([{p_name:'Customer Support',p_previous_name:null},{p_name:'Client Services',p_previous_name:'Customer Support'}]);
 expect(loginAttempts).toBe(0);
});
