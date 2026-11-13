-- Run after 202610140003_ship_inventory.sql.
-- Mobile clients submit scan snapshots here. A signed-in admin imports them
-- into dm_devices through dm_import_mobile_scans().
begin;

alter table public.dm_devices add column if not exists imei text;
alter table public.dm_devices add column if not exists imei2 text;
alter table public.dm_devices add column if not exists eid text;
alter table public.dm_devices add column if not exists upc text;
alter table public.dm_devices add column if not exists mobile_scan_id uuid;

create unique index if not exists dm_devices_mobile_scan_key
  on public.dm_devices(mobile_scan_id)
  where mobile_scan_id is not null;
create unique index if not exists dm_devices_imei_key
  on public.dm_devices(lower(trim(imei)))
  where imei is not null and length(trim(imei)) > 0;
create unique index if not exists dm_devices_imei2_key
  on public.dm_devices(lower(trim(imei2)))
  where imei2 is not null and length(trim(imei2)) > 0;
create unique index if not exists dm_devices_eid_key
  on public.dm_devices(lower(trim(eid)))
  where eid is not null and length(trim(eid)) > 0;

create table if not exists public.dm_mobile_scans (
  id uuid primary key default gen_random_uuid(),
  source_device_id text not null check (length(trim(source_device_id)) between 1 and 160),
  captured_at timestamptz not null default now(),
  name text not null check (length(trim(name)) between 1 and 160),
  model_name text not null check (length(trim(model_name)) between 1 and 120),
  model_number text not null default '' check (length(model_number) <= 120),
  serial_number text,
  ios_version text not null default '' check (length(ios_version) <= 80),
  platform text check (platform in ('iOS', 'Android')),
  capacity text,
  wifi_address text not null default '' check (wifi_address = '' or wifi_address ~* '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
  bluetooth_address text not null default '' check (bluetooth_address = '' or bluetooth_address ~* '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
  barcode text not null check (length(trim(barcode)) between 1 and 200),
  imei text,
  imei2 text,
  eid text,
  upc text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'imported', 'rejected')),
  imported_device_id uuid references public.dm_devices(id) on delete set null,
  imported_at timestamptz
);
create index if not exists dm_mobile_scans_pending_idx
  on public.dm_mobile_scans(status, captured_at);
alter table public.dm_mobile_scans enable row level security;
revoke all on public.dm_mobile_scans from anon, authenticated;

-- This table is an intentionally narrow intake surface. Anonymous mobile clients
-- can submit snapshots, but cannot read inventory, edit scans, or mark imports.
grant insert (source_device_id,captured_at,name,model_name,model_number,serial_number,ios_version,platform,capacity,wifi_address,bluetooth_address,barcode,imei,imei2,eid,upc,payload)
  on public.dm_mobile_scans to anon, authenticated;
grant select on public.dm_mobile_scans to authenticated;
grant update (status,imported_device_id,imported_at) on public.dm_mobile_scans to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dm_mobile_scans' and policyname = 'Mobile clients can submit scan snapshots') then
    create policy "Mobile clients can submit scan snapshots" on public.dm_mobile_scans
      for insert to anon, authenticated
      with check (status = 'pending' and imported_device_id is null and imported_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dm_mobile_scans' and policyname = 'Admins read mobile scans') then
    create policy "Admins read mobile scans" on public.dm_mobile_scans
      for select to authenticated using ((select public.dm_is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dm_mobile_scans' and policyname = 'Admins import mobile scans') then
    create policy "Admins import mobile scans" on public.dm_mobile_scans
      for update to authenticated using ((select public.dm_is_admin())) with check ((select public.dm_is_admin()));
  end if;
end;
$$;

grant insert (imei,imei2,eid,upc,mobile_scan_id) on public.dm_devices to authenticated;
grant execute on function public.dm_is_admin() to authenticated;

create or replace function public.dm_import_mobile_scans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  scan_row record;
  matched_id uuid;
  imported_count integer := 0;
begin
  if not public.dm_is_admin() then
    raise exception 'Admin access required';
  end if;

  for scan_row in
    select *
    from public.dm_mobile_scans
    where status = 'pending'
    order by captured_at, id
    limit 100
    for update skip locked
  loop
    matched_id := null;

    select d.id into matched_id
    from public.dm_devices d
    where d.mobile_scan_id = scan_row.id
      or (scan_row.serial_number is not null and d.serial_number is not null and upper(trim(d.serial_number)) = upper(trim(scan_row.serial_number)))
      or lower(trim(d.barcode)) = lower(trim(scan_row.barcode))
      or (scan_row.imei is not null and d.imei is not null and lower(trim(d.imei)) = lower(trim(scan_row.imei)))
      or (scan_row.imei2 is not null and d.imei2 is not null and lower(trim(d.imei2)) = lower(trim(scan_row.imei2)))
      or (scan_row.eid is not null and d.eid is not null and lower(trim(d.eid)) = lower(trim(scan_row.eid)))
    order by (d.mobile_scan_id = scan_row.id) desc, d.updated_at desc
    limit 1;

    if matched_id is null then
      insert into public.dm_devices(
        name,model_name,model_number,serial_number,ios_version,platform,capacity,
        wifi_address,bluetooth_address,barcode,imei,imei2,eid,upc,mobile_scan_id,
        availability_confirmed
      ) values (
        trim(scan_row.name), trim(scan_row.model_name), trim(scan_row.model_number),
        nullif(upper(trim(scan_row.serial_number)), ''), trim(scan_row.ios_version),
        scan_row.platform, nullif(trim(scan_row.capacity), ''), trim(scan_row.wifi_address),
        trim(scan_row.bluetooth_address), trim(scan_row.barcode), nullif(trim(scan_row.imei), ''),
        nullif(trim(scan_row.imei2), ''), nullif(trim(scan_row.eid), ''), nullif(trim(scan_row.upc), ''),
        scan_row.id, false
      ) returning id into matched_id;
    else
      update public.dm_devices
      set name = trim(scan_row.name),
          model_name = trim(scan_row.model_name),
          model_number = trim(scan_row.model_number),
          serial_number = nullif(upper(trim(scan_row.serial_number)), ''),
          ios_version = trim(scan_row.ios_version),
          platform = coalesce(scan_row.platform, platform),
          capacity = nullif(trim(scan_row.capacity), ''),
          wifi_address = trim(scan_row.wifi_address),
          bluetooth_address = trim(scan_row.bluetooth_address),
          imei = nullif(trim(scan_row.imei), ''),
          imei2 = nullif(trim(scan_row.imei2), ''),
          eid = nullif(trim(scan_row.eid), ''),
          upc = nullif(trim(scan_row.upc), ''),
          mobile_scan_id = scan_row.id
      where id = matched_id;
    end if;

    update public.dm_mobile_scans
    set status = 'imported', imported_device_id = matched_id, imported_at = clock_timestamp()
    where id = scan_row.id;
    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;
revoke all on function public.dm_import_mobile_scans() from public;
grant execute on function public.dm_import_mobile_scans() to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.dm_devices;
  exception when duplicate_object or undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.dm_mobile_scans;
  exception when duplicate_object or undefined_object then null;
  end;
end;
$$;

notify pgrst, 'reload schema';
commit;
