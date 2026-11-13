-- Approved employees may receive devices before completing signup.
-- Login access still requires verified-email activation via migration 009.
begin;
create or replace function public.dm_employee_directory()
returns table(id uuid, name text, team text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() and public.dm_employee_member_id() is null then
    raise exception 'Employee access required' using errcode = '42501';
  end if;
  return query select m.id, m.name, m.team, m.role from public.dm_members m
    where public.dm_is_admin() or exists (select 1 from public.dm_employees e where e.member_id = m.id)
      or exists (select 1 from public.dm_employee_signup_allowlist a where a.member_id = m.id)
    order by m.name;
end;
$$;
revoke all on function public.dm_employee_directory() from public;
grant execute on function public.dm_employee_directory() to authenticated;

create or replace function public.dm_employee_transfer(p_device_id uuid, p_recipient_id uuid, p_version integer)
returns public.dm_devices
language plpgsql security definer set search_path = '' as $$
declare
  employee_id uuid := public.dm_employee_member_id();
  result public.dm_devices;
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  if p_recipient_id = employee_id or (not exists (select 1 from public.dm_employees where member_id = p_recipient_id)
      and not exists (select 1 from public.dm_employee_signup_allowlist where member_id = p_recipient_id)) then
    raise exception 'Choose another approved employee' using errcode = '22023';
  end if;
  update public.dm_devices set holder_id = p_recipient_id
    where id = p_device_id and holder_id = employee_id and version = p_version and not retired
    returning * into result;
  if not found then raise exception 'Device is no longer assigned to you or changed. Refresh and try again.' using errcode = '40001'; end if;
  return result;
end;
$$;
revoke all on function public.dm_employee_transfer(uuid,uuid,integer) from public;
grant execute on function public.dm_employee_transfer(uuid,uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
