-- Pair with Authentication > Email > Confirm email OFF in Supabase.
-- Company accounts enroll automatically as employees, never as admins.
begin;
alter table public.dm_members drop constraint dm_members_team_check;
alter table public.dm_members add constraint dm_members_team_check check (team in ('Mobile','QA','Design','Unassigned'));
create or replace function public.dm_activate_employee() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  account_email text;
  employee_id uuid;
begin
  if account_id is null then raise exception 'Sign in to continue.' using errcode = '42501'; end if;
  -- Serialize enrollment for repeated tabs/sign-in callbacks.
  perform pg_advisory_xact_lock(hashtextextended(account_id::text,0));
  select member_id into employee_id from public.dm_employees where user_id=account_id;
  if employee_id is not null then return employee_id; end if;
  select lower(trim(email)) into account_email from auth.users where id=account_id;
  if account_email is null or account_email !~ '^[^@]+@equicomtech\.com$' then
    raise exception 'Use your @equicomtech.com email to create an employee account.' using errcode = '42501';
  end if;
  -- Known employees keep their original team and devices.
  select member_id into employee_id from public.dm_employee_signup_allowlist where email=account_email;
  if employee_id is null then
    begin
      insert into public.dm_members(name,team,role) values (split_part(account_email,'@',1),'Unassigned','Employee') returning id into employee_id;
    exception when unique_violation then
      -- Never attach a new login to an unrelated record with the same name.
      insert into public.dm_members(name,team,role) values (left(account_email,80)||' ('||account_id::text||')','Unassigned','Employee') returning id into employee_id;
    end;
  end if;
  insert into public.dm_employees(user_id,member_id) values(account_id,employee_id);
  return employee_id;
end;
$$;
revoke all on function public.dm_activate_employee() from public;
grant execute on function public.dm_activate_employee() to authenticated;
notify pgrst, 'reload schema';
commit;
