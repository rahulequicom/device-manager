-- Run after creating and confirming arshad@equicomtech.com in Supabase Auth.
-- Transaction fails without changing existing access if prerequisites are missing.
begin;
do $$
declare
  new_admin uuid;
  previous_admin uuid;
  employee_member uuid;
  existing_member uuid;
begin
  select id into new_admin from auth.users where lower(email)='arshad@equicomtech.com' and email_confirmed_at is not null;
  if new_admin is null then raise exception 'Create and confirm Arshad Auth account first.'; end if;
  select id into previous_admin from auth.users where lower(email)='bkatiyar197@gmail.com';
  if previous_admin is null then raise exception 'Existing bkatiyar197 account not found.'; end if;
  select member_id into existing_member from public.dm_employees where user_id=previous_admin;
  insert into public.dm_members(name,team,role) values('Bhumika','Design','')
    on conflict(lower(trim(name)),team) do nothing;
  select id into employee_member from public.dm_members where lower(trim(name))='bhumika' and team='Design';
  if existing_member is not null and existing_member <> employee_member then
    raise exception 'Existing employee mapping differs. Review before changing it.';
  end if;
  insert into public.dm_admins(user_id) values(new_admin) on conflict(user_id) do nothing;
  insert into public.dm_employees(user_id,member_id) values(previous_admin,employee_member) on conflict(user_id) do nothing;
  insert into public.dm_employee_signup_allowlist(email,member_id) values('bkatiyar197@gmail.com',employee_member)
    on conflict(email) do update set member_id=excluded.member_id;
  delete from public.dm_admins where user_id=previous_admin;
end;
$$;
commit;
