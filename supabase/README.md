# Supabase setup

1. In the project's SQL Editor, run `migrations/202610140001_device_register.sql` once. It creates only `dm_` tables/functions, inserts no sample data, and runs in a transaction. A name collision fails instead of modifying existing tables. Do not rerun after success.
2. In Authentication > Users > Add user, create an email/password user. Use the create-user option, and confirm the email if requested. Keep the password private.
3. In `grant-admin.sql`, replace `REPLACE_WITH_YOUR_EMAIL` with that exact email. Run this second script in SQL Editor. It can be rerun safely.
4. In Project Settings > API Keys, copy the current publishable key or active legacy anon key. Put it in `web/.env.local` as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; set `NEXT_PUBLIC_SUPABASE_URL` from the project's Connect dialog. Never use a secret or service-role key here. Restart the dev server after changes.
5. Run `migrations/202610140003_ship_inventory.sql` to add platform, independent device team, RAM, and unconfirmed availability support and import the supplied twelve-phone inventory. This includes migration 002; do not rerun migration 001. The import can be rerun without overwriting existing records. Missing identifiers remain null and page-two identifiers are excluded until their mapping is confirmed.
6. Run `migrations/202610140004_mobile_sync.sql` to create the mobile scan intake table, identifier columns, and the admin-only import function. This is the bridge between Expo and the web register.
7. Run `migrations/202610140005_mobile_rescan_safety.sql` to preserve an existing web asset barcode when a phone is rescanned using its serial, IMEI, EID, or another box identifier.
8. Sign in to the web app with the email/password created in step 2. Add confirmed people, assign holders or confirm availability, and refresh to verify persistence. Check Audit log for recorded changes.

To verify setup in SQL Editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'dm_%';

select u.email from public.dm_admins a join auth.users u on u.id = a.user_id;
```

Expected tables: `dm_admins`, `dm_members`, `dm_devices`, `dm_audit_events`, `dm_mobile_scans`.

The web app uses Supabase Auth and a browser client. Database RLS is the authorization boundary: anonymous users cannot access these tables; signed-in users must appear in `dm_admins`. Clients cannot grant admin access, forge audit history, or change timestamps/version counters. Device updates and their audit events commit atomically. Conditional version checks prevent the web app from overwriting concurrent changes.

The current app supports a single organization's register. All approved admins have the same access. Member records identify equipment holders, not authentication accounts. Unknown network identifiers stay blank. Marking a device for retirement requires returning it first. No hard-delete action is provided. Mobile scan snapshots are write-only for the public mobile client; only an approved web admin can read them or import them into the inventory.

The Expo app keeps its local register in AsyncStorage and uploads completed device snapshots to `dm_mobile_scans`. The web admin calls `dm_import_mobile_scans()` before loading the inventory, so a scan is imported into `dm_devices` and recorded in the normal audit log. Migration `202610140006_mobile_duplicate_check.sql` adds a narrow public RPC that returns only whether a serial, IMEI, EID, or asset barcode is already registered, and migration `202610140007_mobile_inventory_sync.sql` adds the read-only mobile inventory snapshot used for bidirectional device sync. Supabase publishable keys are safe to bundle in the mobile app because RLS restricts the mobile surface to inserts plus these narrow RPCs; never bundle a service-role key.

The SQL can be validated without a cloud project using `cd web && npm test`. This uses an isolated embedded PostgreSQL instance, not your Supabase database.
