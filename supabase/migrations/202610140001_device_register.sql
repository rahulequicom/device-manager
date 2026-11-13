-- Run once in the Supabase SQL Editor. No sample records are inserted.
begin;

create table public.dm_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.dm_admins enable row level security;
revoke all on public.dm_admins from anon, authenticated;
grant select on public.dm_admins to authenticated;
create policy "Admins can read their own membership" on public.dm_admins
  for select to authenticated using (user_id = (select auth.uid()));

create function public.dm_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dm_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.dm_is_admin() from public;
grant execute on function public.dm_is_admin() to authenticated;

create table public.dm_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  team text not null check (team in ('Mobile', 'QA', 'Design')),
  role text not null default '' check (length(role) <= 160),
  created_at timestamptz not null default now()
);
create unique index dm_members_name_team_key on public.dm_members(lower(trim(name)), team);
alter table public.dm_members enable row level security;
revoke all on public.dm_members from anon, authenticated;
grant select on public.dm_members to authenticated;
grant insert (name, team, role) on public.dm_members to authenticated;
create policy "Admins read members" on public.dm_members for select to authenticated
  using ((select public.dm_is_admin()));
create policy "Admins add members" on public.dm_members for insert to authenticated
  with check ((select public.dm_is_admin()));

create table public.dm_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  model_name text not null check (length(trim(model_name)) between 1 and 120),
  model_number text not null default '' check (length(model_number) <= 120),
  serial_number text not null check (length(trim(serial_number)) between 1 and 120),
  ios_version text not null default '' check (length(ios_version) <= 80),
  capacity text not null check (length(trim(capacity)) between 1 and 80),
  wifi_address text not null default '' check (wifi_address = '' or wifi_address ~* '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
  bluetooth_address text not null default '' check (bluetooth_address = '' or bluetooth_address ~* '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
  barcode text not null check (length(trim(barcode)) between 1 and 200),
  holder_id uuid references public.dm_members(id) on delete restrict,
  retired boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dm_retired_devices_unassigned check (not retired or holder_id is null)
);
create unique index dm_devices_serial_key on public.dm_devices(lower(trim(serial_number)));
create unique index dm_devices_barcode_key on public.dm_devices(lower(trim(barcode)));
create index dm_devices_holder_idx on public.dm_devices(holder_id);
alter table public.dm_devices enable row level security;
revoke all on public.dm_devices from anon, authenticated;
grant select on public.dm_devices to authenticated;
grant insert (name,model_name,model_number,serial_number,ios_version,capacity,wifi_address,bluetooth_address,barcode)
  on public.dm_devices to authenticated;
grant update (name,model_name,model_number,serial_number,ios_version,capacity,wifi_address,bluetooth_address,barcode,holder_id,retired)
  on public.dm_devices to authenticated;
create policy "Admins read devices" on public.dm_devices for select to authenticated
  using ((select public.dm_is_admin()));
create policy "Admins add devices" on public.dm_devices for insert to authenticated
  with check ((select public.dm_is_admin()));
create policy "Admins update devices" on public.dm_devices for update to authenticated
  using ((select public.dm_is_admin())) with check ((select public.dm_is_admin()));

create table public.dm_audit_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.dm_devices(id) on delete restrict,
  device_name text not null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor text not null,
  created_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
create index dm_audit_device_date_idx on public.dm_audit_events(device_id, created_at desc);
create index dm_audit_date_idx on public.dm_audit_events(created_at desc);
alter table public.dm_audit_events enable row level security;
revoke all on public.dm_audit_events from anon, authenticated;
grant select on public.dm_audit_events to authenticated;
create policy "Admins read audit events" on public.dm_audit_events for select to authenticated
  using ((select public.dm_is_admin()));

create function public.dm_prepare_device() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  new.serial_number := upper(trim(new.serial_number));
  new.barcode := trim(new.barcode);
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  return new;
end;
$$;
create trigger dm_prepare_device before insert or update on public.dm_devices
  for each row execute function public.dm_prepare_device();

-- Audit and device writes commit together. Clients cannot forge or edit history.
create function public.dm_record_device_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_action text;
  holder_name text;
  previous_holder text;
begin
  if tg_op = 'INSERT' then
    event_action := 'Device registered';
  elsif new.holder_id is distinct from old.holder_id then
    select name || ' / ' || team into holder_name from public.dm_members where id = new.holder_id;
    select name || ' / ' || team into previous_holder from public.dm_members where id = old.holder_id;
    if new.holder_id is null then
      event_action := 'Returned by ' || coalesce(previous_holder, 'previous holder');
    elsif old.holder_id is null then
      event_action := 'Assigned to ' || holder_name;
    else
      event_action := 'Transferred from ' || previous_holder || ' to ' || holder_name;
    end if;
  elsif new.retired is distinct from old.retired then
    event_action := case when new.retired then 'Marked for retirement' else 'Restored to inventory' end;
  else
    event_action := 'Device information updated';
  end if;
  insert into public.dm_audit_events(device_id,device_name,action,actor_id,actor,before_data,after_data)
  values (new.id,new.name,event_action,auth.uid(),
    coalesce((select email from auth.users where id = auth.uid()), 'Database administrator'),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end;
$$;
revoke all on function public.dm_prepare_device() from public;
revoke all on function public.dm_record_device_event() from public;
create trigger dm_record_device_event after insert or update on public.dm_devices
  for each row execute function public.dm_record_device_event();

commit;
