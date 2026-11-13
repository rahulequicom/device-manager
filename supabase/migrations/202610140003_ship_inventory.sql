-- Run in Supabase SQL Editor. Includes the platform update if not yet applied.
-- Imports purchase-list facts only; no invented holders or historical handovers.
begin;
alter table public.dm_devices add column if not exists platform text check (platform in ('iOS','Android'));
alter table public.dm_devices add column if not exists allocation_team text check (allocation_team in ('Mobile','QA','Design'));
alter table public.dm_devices add column if not exists ram text;
alter table public.dm_devices add column if not exists availability_confirmed boolean not null default true;
alter table public.dm_devices alter column serial_number drop not null;
alter table public.dm_devices alter column capacity drop not null;
grant insert (platform,holder_id,allocation_team,ram,availability_confirmed),
  update (platform,allocation_team,ram,availability_confirmed) on public.dm_devices to authenticated;

create or replace function public.dm_prepare_device() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  new.serial_number := nullif(upper(trim(new.serial_number)), '');
  new.capacity := nullif(trim(new.capacity), '');
  new.barcode := trim(new.barcode);
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    if new.holder_id is distinct from old.holder_id or new.retired is distinct from old.retired then
      new.availability_confirmed := true;
    end if;
  else
    new.version := 1;
    if new.holder_id is not null or new.retired then new.availability_confirmed := true; end if;
  end if;
  return new;
end;
$$;

-- EQ-* values are newly allocated internal asset codes, not manufacturer serials.
insert into public.dm_devices(id,name,model_name,platform,allocation_team,serial_number,ram,capacity,barcode,availability_confirmed)
values
('e9100000-0000-4000-8000-000000000001','Redmi A4 5G','Redmi A4 5G','Android','QA','60376/X5XR00093','8 GB','64 GB','EQ-001',false),
('e9100000-0000-4000-8000-000000000002','iPhone 16 Plus','iPhone 16 Plus','iOS','QA','F92WLYV9NR',null,'128 GB','EQ-002',false),
('e9100000-0000-4000-8000-000000000003','Vivo Y31 5G','Vivo Y31 5G','Android','Mobile','10BFC80JX20056J','6 GB','128 GB','EQ-003',false),
('e9100000-0000-4000-8000-000000000004','Samsung A17 Galaxy','Samsung A17 Galaxy','Android','Design','RZGYC0EGTFB','6 GB','128 GB','EQ-004',false),
('e9100000-0000-4000-8000-000000000005','iPhone 17 (green)','iPhone 17 (green)','iOS','Design','CL4DY7FPWV',null,null,'EQ-005',false),
('e9100000-0000-4000-8000-000000000006','OPPO A3x 5G','OPPO A3x 5G','Android','QA','JBNFDQWC8HH6DQ89','4 GB','64 GB','EQ-006',false),
('e9100000-0000-4000-8000-000000000007','Moto G 57 Power','Moto G 57 Power','Android','QA',null,'8 GB','128 GB','EQ-007',false),
('e9100000-0000-4000-8000-000000000008','Google Pixel 10 a','Google Pixel 10 a','Android','QA',null,null,'256 GB','EQ-008',false),
('e9100000-0000-4000-8000-000000000009','Galaxy S26 FE','Galaxy S26 FE','Android','QA',null,'8 GB','256 GB','EQ-009',false),
('e9100000-0000-4000-8000-000000000010','One Plus 15 R','One Plus 15 R','Android','QA',null,'12 GB','256 GB','EQ-010',false),
('e9100000-0000-4000-8000-000000000011','Realme 15x','Realme 15x','Android','QA',null,'8 GB','256 GB','EQ-011',false),
('e9100000-0000-4000-8000-000000000012','Samsung A17 Galaxy','Samsung A17 Galaxy','Android','QA',null,'6 GB','128 GB','EQ-012',false)
on conflict do nothing;
notify pgrst, 'reload schema';
commit;

select barcode, name, allocation_team, availability_confirmed
from public.dm_devices order by barcode;
