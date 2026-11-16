-- Reversible People lifecycle controls. Shared Auth accounts and history are retained.
begin;
alter table public.dm_members add column is_active boolean not null default true;
alter table public.dm_members add column deleted_at timestamptz;

create or replace function public.dm_employee_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select e.member_id from public.dm_employees e join public.dm_members m on m.id=e.member_id
    where e.user_id=(select auth.uid()) and m.is_active and m.deleted_at is null;
$$;

create function public.dm_employee_access()
returns table(member_id uuid,is_active boolean,deleted_at timestamptz,profile_completed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.member_id,m.is_active,m.deleted_at,e.profile_completed_at
    from public.dm_employees e join public.dm_members m on m.id=e.member_id
    where e.user_id=(select auth.uid());
$$;
revoke all on function public.dm_employee_access() from public;
grant execute on function public.dm_employee_access() to authenticated;

create or replace function public.dm_activate_employee() returns uuid
language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access is not active. Contact your admin.' using errcode='42501'; end if;
  return employee_id;
end;
$$;

drop function public.dm_employee_directory();
create function public.dm_employee_directory()
returns table(id uuid,name text,team text,role text,is_active boolean,deleted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() and public.dm_employee_member_id() is null then raise exception 'Employee access required' using errcode='42501'; end if;
  return query select m.id,m.name,m.team,m.role,m.is_active,m.deleted_at from public.dm_members m
    where public.dm_is_admin() or (m.is_active and m.deleted_at is null and exists(select 1 from public.dm_employees e where e.member_id=m.id))
    order by m.name,m.id;
end;
$$;
revoke all on function public.dm_employee_directory() from public;
grant execute on function public.dm_employee_directory() to authenticated;

-- Coordinate assignments with status changes on the same person row.
create function public.dm_require_active_holder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.holder_id is not null then
    perform 1 from public.dm_members where id=new.holder_id and is_active and deleted_at is null for share;
    if not found then raise exception 'Choose an active person to receive the device.' using errcode='22023'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.dm_require_active_holder() from public;
create trigger dm_require_active_holder before insert or update of holder_id on public.dm_devices
  for each row execute function public.dm_require_active_holder();

create function public.dm_require_active_employee_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.dm_members where id=new.member_id and is_active and deleted_at is null for share;
  if not found then raise exception 'Activate or restore the person before creating their login.' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function public.dm_require_active_employee_link() from public;
create trigger dm_require_active_employee_link before insert on public.dm_employees
  for each row execute function public.dm_require_active_employee_link();

create function public.dm_admin_set_person_state(p_member_id uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare person public.dm_members;
begin
  if not public.dm_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  select * into person from public.dm_members where id=p_member_id for update;
  if not found then raise exception 'Person no longer exists.' using errcode='22023'; end if;
  if exists(select 1 from public.dm_employees e join public.dm_admins a on a.user_id=e.user_id where e.member_id=p_member_id) then
    raise exception 'Admin accounts are protected.' using errcode='42501';
  end if;
  case p_action
    when 'deactivate' then
      if person.deleted_at is not null then raise exception 'Restore the person first.' using errcode='22023'; end if;
      update public.dm_members set is_active=false where id=p_member_id;
    when 'activate' then
      if person.deleted_at is not null then raise exception 'Restore the person first.' using errcode='22023'; end if;
      update public.dm_members set is_active=true where id=p_member_id;
    when 'delete' then
      if exists(select 1 from public.dm_devices where holder_id=p_member_id) then
        raise exception 'Return or transfer this person''s devices before deleting them.' using errcode='22023';
      end if;
      update public.dm_members set is_active=false,deleted_at=coalesce(deleted_at,now()) where id=p_member_id;
    when 'restore' then
      update public.dm_members set is_active=true,deleted_at=null where id=p_member_id;
    else raise exception 'Choose Activate, Deactivate, Delete or Restore.' using errcode='22023';
  end case;
end;
$$;
revoke all on function public.dm_admin_set_person_state(uuid,text) from public;
grant execute on function public.dm_admin_set_person_state(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
