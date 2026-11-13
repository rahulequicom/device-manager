-- Run after 202610140004_mobile_sync.sql.
-- Preserve an existing web asset barcode when a mobile rescan matches by
-- serial, IMEI, EID, or a previous mobile scan identifier.
begin;

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
notify pgrst, 'reload schema';
commit;
