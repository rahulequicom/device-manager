-- Admin-created employee logins. Passwords go only to Supabase Auth, never a profile table.
begin;
create table public.dm_employee_login_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  team text not null,
  role text not null,
  member_id uuid references public.dm_members(id),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table public.dm_employee_login_requests enable row level security;
revoke all on public.dm_employee_login_requests from public,anon,authenticated;

create function public.dm_prepare_employee_login(p_email text,p_name text,p_team text,p_role text,p_member_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if not public.dm_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  p_email:=lower(trim(p_email)); p_name:=trim(p_name); p_role:=trim(coalesce(p_role,''));
  if p_email is null or p_email !~ '^[^@[:space:]]+@equicomtech\.com$' then raise exception 'Enter an @equicomtech.com work email.' using errcode='22023'; end if;
  if p_name is null or length(p_name) not between 1 and 120 then raise exception 'Enter the employee name.' using errcode='22023'; end if;
  if p_team is null or p_team not in ('Mobile','QA','Design') or length(p_role) not between 1 and 160 then raise exception 'Choose a team and a valid role.' using errcode='22023'; end if;
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
revoke all on function public.dm_prepare_employee_login(text,text,text,text,uuid) from public;
grant execute on function public.dm_prepare_employee_login(text,text,text,text,uuid) to authenticated;

-- Consuming a private, admin-authorized token links the new login atomically.
-- Forged user metadata cannot select another employee or grant admin access.
create function public.dm_accept_admin_employee_login() returns trigger
language plpgsql security definer set search_path = '' as $$
declare request public.dm_employee_login_requests; employee_id uuid; supplied_token text;
begin
  supplied_token:=new.raw_user_meta_data->>'dm_employee_login_token';
  if supplied_token is null then return new; end if; -- Other apps share Supabase Auth.
  if supplied_token !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Employee login request is invalid. Ask your admin to try again.';
  end if;
  delete from public.dm_employee_login_requests r where r.id=supplied_token::uuid and r.email=lower(new.email)
    and r.expires_at>now() and exists(select 1 from public.dm_admins a where a.user_id=r.created_by)
    returning * into request;
  if not found then raise exception 'Employee login request expired. Ask your admin to try again.'; end if;
  if request.member_id is null then
    insert into public.dm_members(name,team,role) values(request.name,request.team,request.role) returning id into employee_id;
  else
    employee_id:=request.member_id;
    if exists(select 1 from public.dm_employees where member_id=employee_id) then raise exception 'Employee already has a login.'; end if;
    update public.dm_members set name=request.name,team=request.team,role=request.role where id=employee_id;
    if not found then raise exception 'Employee record no longer exists.'; end if;
  end if;
  insert into public.dm_employees(user_id,member_id,profile_completed_at) values(new.id,employee_id,now());
  return new;
end;
$$;
revoke all on function public.dm_accept_admin_employee_login() from public;
create trigger dm_accept_admin_employee_login after insert on auth.users for each row execute function public.dm_accept_admin_employee_login();

create or replace function public.dm_activate_employee() returns uuid
language plpgsql security definer set search_path = '' as $$
declare employee_id uuid;
begin
  select member_id into employee_id from public.dm_employees where user_id=(select auth.uid());
  if employee_id is null then raise exception 'Ask your admin to create your employee login and share your email and six-digit password.' using errcode='42501'; end if;
  return employee_id;
end;
$$;

create function public.dm_admin_employee_logins() returns table(member_id uuid,email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.dm_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return query select e.member_id,u.email::text from public.dm_employees e join auth.users u on u.id=e.user_id order by e.member_id;
end;
$$;
revoke all on function public.dm_admin_employee_logins() from public;
grant execute on function public.dm_admin_employee_logins() to authenticated;
notify pgrst,'reload schema';
commit;
