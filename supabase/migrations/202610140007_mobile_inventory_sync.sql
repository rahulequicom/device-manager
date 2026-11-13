-- Run after 202610140006_mobile_duplicate_check.sql.
-- Returns the shared register in a deliberately narrow mobile-safe shape.
-- The web tables remain protected by RLS; this RPC exposes no audit data.
begin;

create or replace function public.dm_mobile_inventory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'model_name', d.model_name,
        'model_number', d.model_number,
        'serial_number', d.serial_number,
        'ios_version', d.ios_version,
        'capacity', d.capacity,
        'wifi_address', d.wifi_address,
        'bluetooth_address', d.bluetooth_address,
        'barcode', d.barcode,
        'imei', d.imei,
        'imei2', d.imei2,
        'eid', d.eid,
        'upc', d.upc,
        'holder', case when m.id is null then null else jsonb_build_object('person', m.name, 'team', m.team) end,
        'retired', d.retired,
        'updated_at', d.updated_at,
        'version', d.version,
        'allocation_team', d.allocation_team,
        'availability_confirmed', d.availability_confirmed
      ) order by d.updated_at desc, d.id)
      from public.dm_devices d
      left join public.dm_members m on m.id = d.holder_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dm_mobile_inventory() from public;
grant execute on function public.dm_mobile_inventory() to anon, authenticated;
notify pgrst, 'reload schema';
commit;
