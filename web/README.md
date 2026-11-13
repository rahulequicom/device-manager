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
