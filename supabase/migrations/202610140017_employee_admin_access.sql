-- Explicit delegation of full inventory administration to an existing employee login.
begin;
create table public.dm_admin_access_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  member_id uuid references public.dm_members(id),
  granted boolean not null,
  created_at timestamptz not null default now()
);
alter table public.dm_admin_access_events enable row level security;
revoke all on public.dm_admin_access_events from public,anon,authenticated;
grant select on public.dm_admin_access_events to authenticated;
create policy "Admins read access history" on public.dm_admin_access_events for select to authenticated using (public.dm_is_admin());

create function public.dm_admin_employee_access()
returns table(member_id uuid,is_admin boolean,is_self boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return query select e.member_id,exists(select 1 from public.dm_admins a where a.user_id=e.user_id),e.user_id=(select auth.uid()) from public.dm_employees e;
end;
$$;
revoke all on function public.dm_admin_employee_access() from public;
grant execute on function public.dm_admin_employee_access() to authenticated;

create function public.dm_admin_set_employee_admin(p_member_id uuid,p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare target_user uuid; person public.dm_members; changed integer;
begin
  -- Serialize access changes and recheck authorization after acquiring the lock.
  lock table public.dm_admins in share row exclusive mode;
  if not public.dm_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  if p_granted is null then raise exception 'Choose whether to grant admin access.' using errcode='22023'; end if;
  select * into person from public.dm_members where id=p_member_id for update;
  if not found then raise exception 'Person no longer exists.' using errcode='22023'; end if;
  select e.user_id into target_user from public.dm_employees e where e.member_id=p_member_id;
  if target_user is null then raise exception 'Create an employee login first.' using errcode='22023'; end if;
  if target_user=(select auth.uid()) then raise exception 'You cannot change your own admin access.' using errcode='22023'; end if;
  if p_granted then
    if not person.is_active or person.deleted_at is not null then raise exception 'Activate or restore the employee first.' using errcode='22023'; end if;
    insert into public.dm_admins(user_id) values(target_user) on conflict(user_id) do nothing;
  else
    delete from public.dm_admins where user_id=target_user;
  end if;
  get diagnostics changed = row_count;
  if changed>0 then
    insert into public.dm_admin_access_events(actor_id,target_id,member_id,granted) values((select auth.uid()),target_user,p_member_id,p_granted);
  end if;
end;
$$;
revoke all on function public.dm_admin_set_employee_admin(uuid,boolean) from public;
grant execute on function public.dm_admin_set_employee_admin(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
