-- First-login employee setup. Team/role are profile fields, never admin privileges.
begin;
alter table public.dm_employees add column profile_completed_at timestamptz;

create or replace function public.dm_activate_employee() returns uuid
language plpgsql security definer set search_path = '' as $$
declare account_id uuid := auth.uid(); account_email text; employee_id uuid;
begin
  if account_id is null then raise exception 'Sign in to continue.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id::text,0));
  select member_id into employee_id from public.dm_employees where user_id=account_id;
  if employee_id is not null then return employee_id; end if;
  select lower(trim(email)) into account_email from auth.users where id=account_id;
  if account_email is null or account_email !~ '^[^@]+@equicomtech\.com$' then
    raise exception 'Use your @equicomtech.com email to create an employee account.' using errcode = '42501';
  end if;
  -- Each login owns its own profile; no pre-added email list or name matching.
  begin
    insert into public.dm_members(name,team,role) values (account_email,'Unassigned','') returning id into employee_id;
  exception when unique_violation then
    insert into public.dm_members(name,team,role) values (left(account_email,80)||' ('||account_id::text||')','Unassigned','') returning id into employee_id;
  end;
  insert into public.dm_employees(user_id,member_id) values(account_id,employee_id);
  return employee_id;
end;
$$;

create or replace function public.dm_employee_directory()
returns table(id uuid,name text,team text,role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() and public.dm_employee_member_id() is null then
    raise exception 'Employee access required' using errcode = '42501';
  end if;
  return query select m.id,m.name,m.team,m.role from public.dm_members m
    where public.dm_is_admin() or exists(select 1 from public.dm_employees e where e.member_id=m.id)
    order by m.name,m.id;
end;
$$;

create or replace function public.dm_employee_self_assign(p_device_id uuid,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  update public.dm_devices set holder_id=employee_id
    where id=p_device_id and version=p_version and holder_id is null and not retired;
  if not found then raise exception 'Device is no longer available or changed. Refresh and try again.' using errcode = '40001'; end if;
end;
$$;

create or replace function public.dm_employee_transfer(p_device_id uuid,p_recipient_id uuid,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  if p_recipient_id is null or p_recipient_id=employee_id or not exists(select 1 from public.dm_employees where member_id=p_recipient_id) then
    raise exception 'Choose another employee who has created an account.' using errcode = '22023';
  end if;
  update public.dm_devices set holder_id=p_recipient_id where id=p_device_id and holder_id=employee_id and version=p_version and not retired;
  if not found then raise exception 'Device is no longer assigned to you or changed. Refresh and try again.' using errcode = '40001'; end if;
end;
$$;

create function public.dm_employee_save_profile(p_team text,p_role text,p_device_id uuid default null,p_version integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  if p_team is null or p_team not in ('Mobile','QA','Design') then raise exception 'Choose your team.' using errcode = '22023'; end if;
  if p_role is null or p_role not in ('Developer','QA Tester','Designer','Team Lead','Other') then raise exception 'Choose your role.' using errcode = '22023'; end if;
  begin
    update public.dm_members set team=p_team,role=p_role where id=employee_id;
  exception when unique_violation then
    -- A historical employee with the same name must not block a new profile.
    update public.dm_members set team=p_team,role=p_role,
      name=(select left(lower(email),80)||' ('||id::text||')' from auth.users where id=(select auth.uid()))
      where id=employee_id;
  end;
  if p_device_id is not null then
    -- An existing owned device is valid; all other selections use atomic claiming.
    if not exists(select 1 from public.dm_devices where id=p_device_id and holder_id=employee_id and not retired and version=p_version) then
      perform public.dm_employee_self_assign(p_device_id,p_version);
    end if;
  end if;
  update public.dm_employees set profile_completed_at=now() where user_id=(select auth.uid());
end;
$$;
revoke all on function public.dm_employee_save_profile(text,text,uuid,integer) from public;
grant execute on function public.dm_employee_save_profile(text,text,uuid,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
