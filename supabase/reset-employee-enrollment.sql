-- One-time reviewed reset. Permanently deletes the two employee logins below.
-- Run only after the owner confirms the exact accounts and three device returns.
-- Admins, other applications, device records and activity history are preserved.
begin;
do $$
declare
  reset_ids uuid[] := array['fd753074-8b53-475f-a8d2-83291eae8df6','3f6ff249-483f-4fd0-a607-1f43fc3eb84d']::uuid[];
  reset_emails text[] := array['bkatiyar197@gmail.com','rahul@equicomtech.com'];
  old_emails text[] := array['bhumika@equicomtech.com','bkatiyar197@gmail.com','praveen@equicomtech.com','priyadarshini@equicomtech.com','raghu@equicomtech.com','rahul@equicomtech.com','shaina@equicomtech.com','yajna@equicomtech.com'];
  reset_members uuid[];
  dependency record;
  affected bigint;
  device_count bigint;
  audit_count bigint;
begin
  -- Bind this reset to the reviewed identities; never delete new registrations.
  if (select count(*) from auth.users where id=any(reset_ids) and lower(email)=any(reset_emails))<>2
    or exists(select 1 from auth.users where id=reset_ids[1] and lower(email)<>reset_emails[1])
    or exists(select 1 from auth.users where id=reset_ids[2] and lower(email)<>reset_emails[2]) then
    raise exception 'Employee accounts changed or were already reset. Review again before deleting.';
  end if;
  if exists(select 1 from public.dm_admins where user_id=any(reset_ids)) then raise exception 'Admin preservation check failed.'; end if;
  if (select count(*) from public.dm_admins a join auth.users u on u.id=a.user_id where lower(u.email) in ('arshad@equicomtech.com','vishwateja@equicomtech.com'))<>2 then
    raise exception 'Expected admin accounts are missing. Nothing changed.';
  end if;
  if (select count(*) from public.dm_employee_signup_allowlist)<>8
    or exists(select 1 from public.dm_employee_signup_allowlist where email<>all(old_emails)) then
    raise exception 'Pre-added email list changed. Review again.';
  end if;
  -- A shared Supabase project must not lose another application's records.
  for dependency in select n.nspname as schema_name,c.relname as table_name,a.attname as column_name
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=any(k.conkey)
    where k.contype='f' and k.confrelid='auth.users'::regclass and n.nspname<>'auth'
      and not(n.nspname='public' and c.relname in ('dm_admins','dm_employees','dm_audit_events'))
  loop
    execute format('select count(*) from %I.%I where %I=any($1)',dependency.schema_name,dependency.table_name,dependency.column_name) into affected using reset_ids;
    if affected>0 then raise exception 'Another application has related data in %.%. Nothing changed.',dependency.schema_name,dependency.table_name; end if;
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects where owner_id=any($1)' into affected using array(select id::text from unnest(reset_ids) as id);
    if affected>0 then raise exception 'Employee accounts own storage objects. Nothing changed.'; end if;
  end if;
  select array_agg(member_id) into reset_members from (
    select member_id from public.dm_employee_signup_allowlist
    union select member_id from public.dm_employees where user_id=any(reset_ids)
  ) members;
  if exists(select 1 from public.dm_employees e join public.dm_admins a on a.user_id=e.user_id where e.member_id=any(reset_members)) then raise exception 'An admin profile is included. Nothing changed.'; end if;
  if (select count(*) from public.dm_devices where holder_id=any(reset_members))<>3 then raise exception 'Device assignments changed. Review the three returns again.'; end if;
  select count(*) into device_count from public.dm_devices;
  select count(*) into audit_count from public.dm_audit_events;
  -- Return these devices so employees can choose the mobile they physically have.
  update public.dm_devices set holder_id=null,availability_confirmed=true where holder_id=any(reset_members);
  delete from public.dm_employee_signup_allowlist where email=any(old_emails);
  delete from auth.users where id=any(reset_ids) and not exists(select 1 from public.dm_admins a where a.user_id=auth.users.id);
  if (select count(*) from public.dm_devices)<>device_count or (select count(*) from public.dm_audit_events)<>audit_count+3 then
    raise exception 'Device/history preservation check failed. Reset rolled back.';
  end if;
end;
$$;
commit;
select (select count(*) from public.dm_employee_signup_allowlist) as pre_added_emails_remaining,
  (select count(*) from auth.users where id in ('fd753074-8b53-475f-a8d2-83291eae8df6','3f6ff249-483f-4fd0-a607-1f43fc3eb84d')) as old_employee_logins_remaining,
  (select count(*) from public.dm_admins a join auth.users u on u.id=a.user_id where lower(u.email) in ('arshad@equicomtech.com','vishwateja@equicomtech.com')) as admins_preserved;
