-- Run after 202610140005_mobile_rescan_safety.sql.
-- Expose only a narrow duplicate check to the mobile client. The inventory
-- itself remains protected by RLS; the client receives only a boolean and name.
begin;

create or replace function public.dm_check_mobile_identity(
  p_serial text default null,
  p_imei text default null,
  p_imei2 text default null,
  p_eid text default null,
  p_barcode text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object('registered', true, 'name', d.name)
      from public.dm_devices d
      where (nullif(trim(p_serial), '') is not null and upper(trim(d.serial_number)) = upper(trim(p_serial)))
         or (nullif(trim(p_imei), '') is not null and lower(trim(d.imei)) = lower(trim(p_imei)))
         or (nullif(trim(p_imei2), '') is not null and lower(trim(d.imei2)) = lower(trim(p_imei2)))
         or (nullif(trim(p_eid), '') is not null and lower(trim(d.eid)) = lower(trim(p_eid)))
         or (nullif(trim(p_barcode), '') is not null and lower(trim(d.barcode)) = lower(trim(p_barcode)))
      order by d.updated_at desc
      limit 1
    ),
    jsonb_build_object('registered', false)
  );
$$;

revoke all on function public.dm_check_mobile_identity(text, text, text, text, text) from public;
grant execute on function public.dm_check_mobile_identity(text, text, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
