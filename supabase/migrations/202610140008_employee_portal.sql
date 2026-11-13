-- Run after migration 007. Employee access is explicitly approved, never self-enrolled.
begin;
create table public.dm_employees (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid not null unique references public.dm_members(id) on delete restrict
);
alter table public.dm_employees enable row level security;
revoke all on public.dm_employees from anon, authenticated;
grant select on public.dm_employees to authenticated;
create policy "Employees read their membership" on public.dm_employees
  for select to authenticated using (user_id = (select auth.uid()));

create function public.dm_employee_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select member_id from public.dm_employees where user_id = (select auth.uid());
$$;
revoke all on function public.dm_employee_member_id() from public;
grant execute on function public.dm_employee_member_id() to authenticated;
create policy "Employees read their devices" on public.dm_devices
  for select to authenticated using (holder_id = (select public.dm_employee_member_id()));

create function public.dm_employee_directory()
returns table(id uuid, name text, team text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() and public.dm_employee_member_id() is null then
    raise exception 'Employee access required' using errcode = '42501';
  end if;
  return query select m.id, m.name, m.team, m.role from public.dm_members m
    where public.dm_is_admin() or exists (select 1 from public.dm_employees e where e.member_id = m.id)
    order by m.name;
end;
$$;
revoke all on function public.dm_employee_directory() from public;
grant execute on function public.dm_employee_directory() to authenticated;

create function public.dm_employee_add_device(p_input jsonb) returns public.dm_devices
language plpgsql security definer set search_path = '' as $$
declare
  employee_id uuid := public.dm_employee_member_id();
  result public.dm_devices;
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  if coalesce(p_input->>'platform', '') not in ('iOS', 'Android') then raise exception 'Choose iOS or Android' using errcode = '22023'; end if;
  insert into public.dm_devices(name,model_name,platform,serial_number,capacity,barcode,holder_id,availability_confirmed)
  values (trim(p_input->>'name'), trim(p_input->>'model_name'), p_input->>'platform',
    nullif(trim(p_input->>'serial_number'), ''), nullif(trim(p_input->>'capacity'), ''),
    coalesce(nullif(trim(p_input->>'barcode'), ''), 'EQ-' || gen_random_uuid()::text), employee_id, true)
  returning * into result;
  return result;
end;
$$;
revoke all on function public.dm_employee_add_device(jsonb) from public;
grant execute on function public.dm_employee_add_device(jsonb) to authenticated;

create function public.dm_employee_transfer(p_device_id uuid, p_recipient_id uuid, p_version integer)
returns public.dm_devices
language plpgsql security definer set search_path = '' as $$
declare
  employee_id uuid := public.dm_employee_member_id();
  result public.dm_devices;
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  if p_recipient_id = employee_id or not exists (select 1 from public.dm_employees where member_id = p_recipient_id) then
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

-- Local admin sync preserves UUIDs for idempotent retries. Existing RLS still
-- restricts direct inserts to admins; employees use the narrow RPCs above.
grant insert(id) on public.dm_members, public.dm_devices to authenticated;
notify pgrst, 'reload schema';
commit;
