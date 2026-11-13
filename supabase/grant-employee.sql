-- Run migration 008 first. Create the user's email/password account in Supabase
-- Authentication and their people record in the admin dashboard before running.
-- Use exact member UUIDs rather than matching potentially ambiguous names.
do $$
declare
  employee_email text := 'REPLACE_WITH_EMPLOYEE_EMAIL';
  employee_member_id uuid := '00000000-0000-0000-0000-000000000000';
  employee_user_id uuid;
begin
  select id into employee_user_id from auth.users where lower(email) = lower(trim(employee_email));
  if employee_user_id is null then raise exception 'Create the Auth account for % first.', employee_email; end if;
  if not exists (select 1 from public.dm_members where id = employee_member_id) then raise exception 'Choose an existing dm_members.id.'; end if;
  insert into public.dm_employees(user_id,member_id) values(employee_user_id,employee_member_id)
    on conflict (user_id) do update set member_id = excluded.member_id;
end;
$$;
