-- Employees retain visibility of their own historical handovers after transfer.
-- Existing admin policy and immutable audit triggers remain unchanged.
begin;
create policy "Employees read their activity" on public.dm_audit_events
  for select to authenticated using (
    (select public.dm_employee_member_id()) is not null
    and (
      actor_id = (select auth.uid())
      or before_data->>'holder_id' = (select public.dm_employee_member_id())::text
      or after_data->>'holder_id' = (select public.dm_employee_member_id())::text
    )
  );
notify pgrst, 'reload schema';
commit;
