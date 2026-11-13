# Device Management Admin Dashboard

Next.js admin dashboard backed by Supabase Auth and PostgreSQL. Includes one inventory, people, assignment/transfer/return, editing, retirement, and an immutable device audit log. There is no sample fallback or separate preview register.

Run `../supabase/migrations/202610140003_ship_inventory.sql` after the initial schema. It includes platform support and imports the twelve supplied purchase-list devices without inventing holders or availability. Missing serials and capacity are nullable; EQ-* codes are internal asset IDs. Re-running does not overwrite existing records.

Follow `../supabase/README.md` to create the tables, grant the first admin access, and configure `.env.local`. The Expo app stores its register locally, uploads completed device snapshots to Supabase, and the web app imports those snapshots into the shared inventory.

## Run

```sh
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

```sh
cd web
npm run typecheck
npm test
npm run build
```

For hosting, deploy `web/` as the Next.js project root and provide the same public environment variables at build time. The existing owner-private Site is https://device-register-admin.equicomtech-7713.chatgpt.site. Arshad needs both Site viewer access and a Supabase admin account before handoff.

## Local inventory without sign-in

Set `NEXT_PUBLIC_LOCAL_INVENTORY=true` in `.env.local` and run `npm run dev`. This activates only in development on localhost, 127.0.0.1 or ::1. Production always requires Supabase authentication. Set the flag to false to return to the shared register.

Local mode starts with the twelve purchase-list records from migration 003 and no holders. Devices, people and audit entries persist in this browser's localStorage under `device-manager-local-inventory-v1`. This local register can upload edits to Supabase after a one-time admin sign-in; it does not download cloud changes or import mobile scans. Clearing browser storage removes local edits. Use the same host and port to access the same local register.

### Save local edits to Supabase

In the local dashboard, select **Sign in once to sync**, then enter an existing Supabase admin account. The Supabase browser client retains and refreshes the session. Pending edits and local people upload after sign-in; later saves, window focus and reconnects retry automatically. **Sync now** retries explicitly; **Disconnect** ends the session and keeps local records. An expired/revoked session requires signing in again. No service-role credential is used.

The first admin account still needs creation in Supabase Authentication and membership via `../supabase/grant-admin.sql`. The purchase-list migration must already exist in Supabase. The public anon key alone cannot grant access.

Sync uploads only locally changed device fields using the cloud record's current version. It never bulk uploads unchanged seed records or local version counters. A conflicting edit stops that sync with an error and preserves local data; earlier successful records may already be saved. People use their local UUIDs to avoid duplication on retry. Cloud audit triggers record the authenticated upload; historical local audit timestamps are not copied. This is an upload of final state, so multiple offline actions may become one cloud audit event.

Changes made elsewhere remain in Supabase and are not pulled into this local register. Review a conflicting record in the authenticated shared dashboard before reconciling it. Do not clear browser storage while edits are pending. Session and inventory storage are scoped to the browser origin, so keep using the same host and port.

## Employee home and admin workspace

`/` is the employee home page: assigned devices, registration, and transfers. `/admin` retains the full admin dashboard. Outside the localhost development preview, both require login and approved database membership. Employees see only their own devices; admins see the entire inventory. Employee registrations assign the device to the current employee; transfers remove it from their list and place it in the recipient's list.

Apply Supabase migration `202610140008_employee_portal.sql` and link employee accounts using `../supabase/grant-employee.sql`. See `../supabase/README.md`. Local previews retain the existing inventory and offer a **Preview as** employee selector using the people records created in `/admin`. New local registrations participate in admin cloud sync after migration 008 is applied.

`/signup` lets employees choose a six-digit numeric password and verify their approved work email. It generates no temporary passwords. Password reset uses the same six-digit form policy; existing login passwords remain accepted until their owners change them. Exact numeric formatting is validated by the app; Supabase Auth also enforces its server password requirements. Use `http://localhost:3000/signup` locally. The authenticated employee home is `/?cloud=1`, which opts out of the local development preview. Signup requires migration 009, an approved email mapping, and custom SMTP for employee email delivery; see `../supabase/README.md`.

## GitHub Pages

`.github/workflows/pages.yml` builds `web/` as static pages and publishes through GitHub Actions. A repository owner/maintainer must first enable Settings → Pages → Source: GitHub Actions. Pushes to main then build, test and deploy automatically. The project URL is `https://rahulequicom.github.io/device-manager/` once deployment succeeds.

`NEXT_PUBLIC_BASE_PATH=/device-manager` prefixes internal links, callback paths and assets. Production always requires Supabase login; development inventory is excluded from public bundles. Supabase public project keys are embedded intentionally; database RLS controls access. Add `https://rahulequicom.github.io/device-manager/signup` to Supabase Auth redirect URLs before using signup/password recovery on the hosted site. Keep existing redirect entries for other apps using the same project.

In the admin workspace, **Activity** shows events for all employees and devices, with historical handover details, asset/serial, actor, and timestamps including seconds in IST. The employee filter matches either holder in a handover. Search matches employees, devices, actors, asset codes, and serials. The existing admin audit read policy supplies all records; employee activity stays restricted by RLS.

Existing admins can sign in at `/signup` using **Already registered? Sign in**, then **Continue to workspace**. The page checks `dm_admins` and opens `/admin` without employee activation or password replacement. **Forgot your password?** starts the email recovery flow.
