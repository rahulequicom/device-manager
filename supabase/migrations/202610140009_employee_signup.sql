-- Run after 008. Approved emails are private and managed by the database owner.
begin;
create table public.dm_employee_signup_allowlist (
  email text primary key check (email = lower(trim(email)) and position('@' in email) > 1),
  member_id uuid not null unique references public.dm_members(id) on delete cascade
);
alter table public.dm_employee_signup_allowlist enable row level security;
revoke all on public.dm_employee_signup_allowlist from anon, authenticated;

create function public.dm_activate_employee() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  account_email text;
  approved_member uuid;
  existing_member uuid;
begin
  select lower(trim(email)) into account_email from auth.users
    where id = account_id and email_confirmed_at is not null;
  if account_email is null then raise exception 'Verify your work email before requesting access.' using errcode = '42501'; end if;
  select member_id into approved_member from public.dm_employee_signup_allowlist where email = account_email;
  if approved_member is null then raise exception 'Your work email is awaiting administrator approval. Contact your administrator to link it to your employee record.' using errcode = '42501'; end if;
  select member_id into existing_member from public.dm_employees where user_id = account_id;
  if existing_member is not null and existing_member <> approved_member then raise exception 'Account is already linked to another employee.' using errcode = '42501'; end if;
  insert into public.dm_employees(user_id,member_id) values(account_id,approved_member)
    on conflict(user_id) do nothing;
  return approved_member;
end;
$$;
revoke all on function public.dm_activate_employee() from public;
grant execute on function public.dm_activate_employee() to authenticated;
notify pgrst, 'reload schema';
commit;
