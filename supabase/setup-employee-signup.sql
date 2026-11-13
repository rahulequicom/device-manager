-- Apply migration 009 first. Explicitly approved employee email mappings.
begin;
insert into public.dm_members(name,team,role) values
  ('Yajna','QA',''),('Priyadarshini','QA',''),('Raghu','QA','')
on conflict (lower(trim(name)),team) do nothing;
insert into public.dm_employee_signup_allowlist(email,member_id)
select e.email, m.id
from (values
 ('bhumika','QA','bhumika@equicomtech.com'),
 ('rahul','QA','rahul@equicomtech.com'),
 ('shaina','Design','shaina@equicomtech.com'),
 ('praveen','Design','praveen@equicomtech.com'),
 ('yajna','QA','yajna@equicomtech.com'),
 ('priyadarshini','QA','priyadarshini@equicomtech.com'),
 ('raghu','QA','raghu@equicomtech.com')
) as e(name,team,email)
join public.dm_members m on lower(trim(m.name))=e.name and m.team=e.team
on conflict(email) do update set member_id=excluded.member_id;
commit;
