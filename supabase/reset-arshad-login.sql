-- Reviewed account: arshad@equicomtech.com, currently admin-only, no employee mapping.
-- Permanently deletes this Auth account and its admin access. Requires owner confirmation.
-- Run separately from migrations; then recreate using People > Add person.
begin;
do $$
declare
  target uuid := '7866dbba-7d1e-425b-8218-3823b01a4a56';
  dependency record;
  affected bigint;
begin
  if not exists(select 1 from auth.users where id=target and lower(email)='arshad@equicomtech.com') then
    raise exception 'Account changed or was already deleted. Review again.';
  end if;
  lock table public.dm_admins in share row exclusive mode;
  if not exists(select 1 from public.dm_admins where user_id<>target) then
    raise exception 'Another admin must remain.';
  end if;
  if exists(select 1 from public.dm_employees where user_id=target) then
    raise exception 'Employee mapping changed. Review assignments before deleting.';
  end if;
  -- Refuse cascades into other apps or newly introduced dependencies.
  for dependency in select n.nspname as schema_name,c.relname as table_name,a.attname as column_name
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=any(k.conkey)
    where k.contype='f' and k.confrelid='auth.users'::regclass and n.nspname<>'auth'
      and not(n.nspname='public' and c.relname in ('dm_admins','dm_audit_events','dm_admin_access_events'))
  loop
    execute format('select count(*) from %I.%I where %I=$1',dependency.schema_name,dependency.table_name,dependency.column_name) into affected using target;
    if affected>0 then raise exception 'Related data in %.%. Nothing changed.',dependency.schema_name,dependency.table_name; end if;
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects where owner_id=$1' into affected using target::text;
    if affected>0 then raise exception 'Account owns storage objects. Nothing changed.'; end if;
  end if;
  delete from auth.users where id=target and lower(email)='arshad@equicomtech.com';
end;
$$;
commit;
select count(*) as old_login_remaining from auth.users where lower(email)='arshad@equicomtech.com';
