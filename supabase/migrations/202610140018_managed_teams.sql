-- Admin-managed team names shared by people, devices and enrollment.
begin;
create table public.dm_teams (
  name text primary key check (name=btrim(name) and length(name) between 1 and 60)
);
create unique index dm_teams_normalized_name on public.dm_teams(lower(name));
insert into public.dm_teams(name) values('Mobile'),('QA'),('Design'),('Unassigned');
alter table public.dm_teams enable row level security;
revoke all on public.dm_teams from public,anon,authenticated;
grant select on public.dm_teams to authenticated;
create policy "Approved users read teams" on public.dm_teams for select to authenticated
  using (public.dm_is_admin() or public.dm_employee_member_id() is not null);
alter table public.dm_members drop constraint dm_members_team_check;
alter table public.dm_devices drop constraint dm_devices_allocation_team_check;
alter table public.dm_members add constraint dm_members_team_fkey foreign key(team) references public.dm_teams(name) on update cascade;
alter table public.dm_devices add constraint dm_devices_allocation_team_fkey foreign key(allocation_team) references public.dm_teams(name) on update cascade;
alter table public.dm_employee_login_requests add constraint dm_login_request_team_fkey foreign key(team) references public.dm_teams(name) on update cascade;

create function public.dm_admin_save_team(p_name text,p_previous_name text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  p_name:=btrim(p_name);
  if p_name is null or length(p_name) not between 1 and 60 or lower(p_name) in ('all','unassigned') then
    raise exception 'Enter a team name of 1–60 characters. All and Unassigned are reserved.' using errcode='22023';
  end if;
  if p_previous_name is null then
    insert into public.dm_teams(name) values(p_name);
  else
    if lower(p_previous_name)='unassigned' then raise exception 'Unassigned is reserved.' using errcode='22023'; end if;
    update public.dm_teams set name=p_name where name=p_previous_name;
    if not found then raise exception 'Team changed or no longer exists. Refresh and try again.' using errcode='40001'; end if;
  end if;
  return p_name;
exception when unique_violation then
  raise exception 'A team with that name already exists.' using errcode='22023';
end;
$$;
revoke all on function public.dm_admin_save_team(text,text) from public;
grant execute on function public.dm_admin_save_team(text,text) to authenticated;

create or replace function public.dm_prepare_employee_login(p_email text,p_name text,p_team text,p_role text,p_member_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if not public.dm_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  p_email:=lower(trim(p_email)); p_name:=trim(p_name); p_role:=trim(coalesce(p_role,''));
  if p_email is null or p_email !~ '^[^@[:space:]]+@equicomtech\.com$' then raise exception 'Enter an @equicomtech.com work email.' using errcode='22023'; end if;
  if p_name is null or length(p_name) not between 1 and 120 then raise exception 'Enter the employee name.' using errcode='22023'; end if;
  if p_team is null or not exists(select 1 from public.dm_teams where name=p_team and name<>'Unassigned') or length(p_role) not between 1 and 160 then raise exception 'Choose a team and a valid role.' using errcode='22023'; end if;
  if exists(select 1 from auth.users where lower(email)=p_email) then raise exception 'That email already has a login. Its password was not changed.' using errcode='22023'; end if;
  if p_member_id is not null then
    if not exists(select 1 from public.dm_members where id=p_member_id) then raise exception 'Employee record no longer exists.' using errcode='22023'; end if;
    if exists(select 1 from public.dm_employees where member_id=p_member_id) then raise exception 'This employee already has a login.' using errcode='22023'; end if;
  elsif exists(select 1 from public.dm_members where lower(trim(name))=lower(p_name) and team=p_team) then
    raise exception 'This person is already listed. Use Create login on their existing row.' using errcode='22023';
  end if;
  delete from public.dm_employee_login_requests where expires_at<now();
  insert into public.dm_employee_login_requests(email,name,team,role,member_id,created_by)
    values(p_email,p_name,p_team,p_role,p_member_id,(select auth.uid()))
    on conflict(email) do update set id=gen_random_uuid(),name=excluded.name,team=excluded.team,role=excluded.role,
      member_id=excluded.member_id,created_by=excluded.created_by,expires_at=now()+interval '10 minutes'
    returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.dm_employee_save_profile(p_team text,p_role text,p_device_id uuid default null,p_version integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := public.dm_employee_member_id();
begin
  if employee_id is null then raise exception 'Employee access required' using errcode = '42501'; end if;
  if p_team is null or not exists(select 1 from public.dm_teams where name=p_team and name<>'Unassigned') then raise exception 'Choose your team.' using errcode = '22023'; end if;
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

notify pgrst,'reload schema';
commit;
