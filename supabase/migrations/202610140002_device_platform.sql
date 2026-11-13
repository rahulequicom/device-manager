-- Run after the original device-register migration. Existing records are preserved.
begin;
alter table public.dm_devices add column if not exists platform text
  check (platform in ('iOS', 'Android'));
grant insert (platform, holder_id), update (platform) on public.dm_devices to authenticated;
-- Existing OS versions remain in ios_version for compatibility with older clients.
comment on column public.dm_devices.ios_version is 'OS version for either iOS or Android; legacy column name retained for compatibility.';
notify pgrst, 'reload schema';
commit;
