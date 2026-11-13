-- Admins own device registration/specifications. Employees use a safe catalog.
begin;
drop policy "Employees read their devices" on public.dm_devices;
drop policy "Employees read their activity" on public.dm_audit_events;
revoke execute on function public.dm_employee_add_device(jsonb) from authenticated;
grant update (imei,imei2,eid,upc) on public.dm_devices to authenticated;

create function public.dm_employee_catalog()
returns table(id uuid,name text,holder_id uuid,retired boolean,version integer,availability_confirmed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() and public.dm_employee_member_id() is null then
    raise exception 'Employee access required' using errcode = '42501';
  end if;
  return query select d.id,d.name,d.holder_id,d.retired,d.version,d.availability_confirmed
    from public.dm_devices d where not d.retired order by d.id;
end;
$$;
revoke all on function public.dm_employee_catalog() from public;
grant execute on function public.dm_employee_catalog() to authenticated;

-- A single atomic update prevents two employees claiming the same device.
create function public.dm_employee_self_assign(p_device_id uuid,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  update public.dm_devices set holder_id = employee_id
    where id = p_device_id and version = p_version and holder_id is null
      and not retired and availability_confirmed;
  if not found then raise exception 'Device is no longer available or changed. Refresh and try again.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.dm_employee_self_assign(uuid,integer) from public;
grant execute on function public.dm_employee_self_assign(uuid,integer) to authenticated;

-- Do not return a complete dm_devices record to the employee on transfer.
drop function public.dm_employee_transfer(uuid,uuid,integer);
create function public.dm_employee_transfer(p_device_id uuid,p_recipient_id uuid,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  if p_recipient_id is null or p_recipient_id = employee_id or (not exists (select 1 from public.dm_employees where member_id=p_recipient_id)
      and not exists (select 1 from public.dm_employee_signup_allowlist where member_id=p_recipient_id)) then
    raise exception 'Choose another approved employee' using errcode = '22023';
  end if;
  update public.dm_devices set holder_id=p_recipient_id
    where id=p_device_id and holder_id=employee_id and version=p_version and not retired;
  if not found then raise exception 'Device is no longer assigned to you or changed. Refresh and try again.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.dm_employee_transfer(uuid,uuid,integer) from public;
grant execute on function public.dm_employee_transfer(uuid,uuid,integer) to authenticated;

create function public.dm_employee_activity()
returns table(id uuid,device_id uuid,device_name text,action text,actor text,created_at timestamptz,before_data jsonb,after_data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  return query select a.id,a.device_id,a.device_name,a.action,a.actor,a.created_at,
    case when a.before_data is null then null else jsonb_build_object('holder_id',a.before_data->'holder_id') end,
    jsonb_build_object('holder_id',a.after_data->'holder_id')
    from public.dm_audit_events a where a.actor_id=(select auth.uid())
      or a.before_data->>'holder_id'=employee_id::text or a.after_data->>'holder_id'=employee_id::text
    order by a.created_at desc,a.id;
end;
$$;
revoke all on function public.dm_employee_activity() from public;
grant execute on function public.dm_employee_activity() to authenticated;

-- The legacy public mobile snapshot exposed specifications without login.
-- Preserve its full payload for admins, require admin authentication for reads.
alter function public.dm_mobile_inventory() rename to dm_admin_mobile_inventory;
revoke all on function public.dm_admin_mobile_inventory() from public,anon,authenticated;
create function public.dm_mobile_inventory() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() then raise exception 'Admin access required to read mobile specifications' using errcode = '42501'; end if;
  return public.dm_admin_mobile_inventory();
end;
$$;
revoke all on function public.dm_mobile_inventory() from public;
grant execute on function public.dm_mobile_inventory() to authenticated;
notify pgrst, 'reload schema';
commit;
