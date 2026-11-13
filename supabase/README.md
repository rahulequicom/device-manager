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

## Employee home page

Apply `migrations/202610140008_employee_portal.sql` after migration 007. Create each employee's Supabase Auth account and people record, then run `grant-employee.sql` with their email and `dm_members.id`. Linking is an administrator action; signing up alone does not grant employee access. Remove the `dm_employees` row to revoke employee access (existing admin access is independent).

The home page `/` shows employees only devices assigned to their linked member record. New registrations are assigned to that employee by the database. Transfers require current ownership, the current record version, a non-retired device, and another approved employee recipient. After a transfer the device leaves the sender's list. Employees cannot directly edit devices, add people, grant access or edit audit history. `/admin` retains the full inventory for admins; admins can also use the home page to register devices.

Migration 008 adds read RLS and narrow registration/transfer RPCs without changing existing mobile intake/snapshot behavior. It also grants admins permission to preserve local device/member UUIDs on sync through the existing admin insert policies. The localhost development bypass remains an explicitly labeled preview, with a selector for checking each person's view. It is not employee authentication.

## Work-email signup and chosen passwords

Migration `202610140009_employee_signup.sql` adds a private email-to-member allowlist and `dm_activate_employee()`. Only a verified Auth email matching an approved row can activate membership; names or client metadata cannot select a member. `setup-employee-signup.sql` contains the seven explicitly approved work emails and adds Yajna, Priyadarshini, and Raghu to QA. Apply both after 008.

Employees open `/signup`, choose their own six-digit numeric password, verify their work email, and continue to their workspace. The app does not generate or display temporary passwords. New-password and recovery forms preserve leading zeros and require exactly six ASCII digits; existing login passwords stay valid until changed. Passwords are sent directly to Supabase Auth, never saved by the app in browser storage or logs. Exact numeric formatting is an application-level validation; the Auth service enforces its own password policy too.

Configure custom SMTP in Supabase Authentication → Emails → SMTP Settings before employee rollout. The default Supabase sender restricts recipient addresses to organization team members. Keep email confirmation enabled. Allow `http://localhost:3000/signup` (or `http://localhost:3000/**`) as an Auth redirect for this local setup. The signup page canonicalizes 127.0.0.1 callback URLs to localhost to match the existing project allowlist. Production requires its own hosted signup URL and redirect allowlist; localhost links work only on the machine running the app. Do not change a shared project's Site URL for this app.

Reference: https://supabase.com/docs/guides/auth/auth-smtp

Migration `202610140010_approved_transfer_recipients.sql` includes approved signup-allowlist members in the employee directory and transfer-recipient checks, even before their first login. Activated employees remain valid recipients too. Only the current holder may transfer a non-retired device with its current version. The recipient gains login access only after verified-email activation; this migration does not create accounts or activate membership. Employee directory results exclude private email addresses.

Migration `202610140011_employee_activity.sql` allows approved employees to read audit events they performed or participated in as the recorded previous/next holder. Historical transfers remain visible after the sender no longer holds the device. Other employees' unrelated history remains hidden. Admin visibility and immutable transactional audit triggers are unchanged. The employee home's **Activity** tab uses these existing events, including older transfers, and displays device/asset/serial, historical action, actor, and timestamp to the second in Asia/Kolkata (IST). It refreshes every 30 seconds and opens after a successful transfer. Browser-local activity uses device-local timestamps and the existing local coordinator attribution.
