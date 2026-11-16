## Employee first-login setup (migration 014)

The employee flow is company email + password → select Team, Role and current Mobile → Save and continue. Employees may choose Mobile, QA or Design and a job role; these choices do not confer admin privileges. An unassigned device can be claimed without a separate availability approval. A device held by another employee cannot be taken over. Employees with no device can finish setup and choose one later.

Apply `supabase/migrations/202610140014_employee_setup.sql` before deploying the new UI. The pre-added email list is no longer used for enrollment or transfer recipients. Admins see saved teams, roles and current device holders in the existing People and Inventory views. Specifications remain admin-only. Historical employee/member records are retained for activity attribution when resetting login accounts.

## Simple company signup (migration 013)

Employee signup asks for company email and a six-digit password, then opens the workspace automatically. Existing sign-ins also enter directly; there is no Continue or email-verification step in the normal flow. Any `@equicomtech.com` account can enroll as an employee. Existing email-to-employee mappings preserve devices and teams; new employees use the email username and an Unassigned team. New accounts never receive admin access or private specifications.

Before deploying this flow, the Supabase project owner must turn off **Authentication → Sign In / Providers → Confirm email** and save. This is a project-wide setting, including other applications sharing this project. Apply `supabase/migrations/202610140013_simple_company_signup.sql` after 012. The enrollment RPC deliberately no longer requires email ownership verification. Existing accounts outside the company domain retain their previous access; new outside-domain accounts cannot enroll.

# Current GitHub Pages deployment

Live employee workspace: https://rahulequicom.github.io/device-manager/
Admin workspace: https://rahulequicom.github.io/device-manager/admin/

Admins use **Inventory → Add device** for name, model, platform, serial number and optional cellular/network specifications. New devices are available for employee self-assignment. Required identity fields are name, model, platform and serial number; IMEI is optional for non-cellular devices.

Employees see device names, availability and current holders. They can assign an available device to themselves and transfer their own device to an approved employee. They cannot register devices or retrieve specifications through device, transfer or activity APIs. Assignment and transfer events retain timestamps in the admin dashboard.

Apply `supabase/migrations/202610140012_private_specs_self_assignment.sql` after migration 011. It also requires admin authentication for the legacy mobile inventory read endpoint, which previously exposed serial numbers and IMEIs anonymously. Older anonymous mobile inventory downloads will require an authenticated admin client. Local development preview remains a deliberately separate admin sandbox.

The workflow in `.github/workflows/pages.yml` deploys the static export under `/device-manager`.

---

# Web dashboard deployment

Live URL: https://device-register-admin.equicomtech-7713.chatgpt.site

The Site is owner-private and additionally requires Supabase admin sign-in. Deployment succeeded on 14 October 2026. The source project ID is retained in `web/.openai/hosting.json`.

The source of truth remains `web/` in this repository. It builds as a Next.js static export and calls Supabase directly with the public client key; database RLS enforces access. The initial hosted source was synchronized from a sanitized staging checkout at `/private/tmp/device-register-hosted`. No `.env.local`, mobile records, or unused employee photos were uploaded. The public Supabase configuration is compiled into the browser bundle as expected.

Applied design guidance: Appllama app design (adapted for web), Vercel React best practices, Emil Kowalski animate and emil-design-eng, Jakub Krehel better-ui, and transferable SwiftUI accessibility/navigation principles. Google Sans files and their license are bundled from the existing Expo dependency.

Verification: TypeScript, production static build, and four Playwright checks across desktop and mobile. Browser tests use isolated API fixtures, not production records. Empty, populated, and dialog screenshots were inspected. Production deployment was confirmed by the hosting service. A live signed-in cloud write was not performed by the agent.

The mobile app still uses local AsyncStorage. Its records have not been imported or synchronized. Adding a record in either the hosted or local web dashboard writes to the same Supabase project.
