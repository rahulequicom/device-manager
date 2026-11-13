# Web dashboard deployment

Live URL: https://device-register-admin.equicomtech-7713.chatgpt.site

The Site is owner-private and additionally requires Supabase admin sign-in. Deployment succeeded on 14 October 2026. The source project ID is retained in `web/.openai/hosting.json`.

The source of truth remains `web/` in this repository. It builds as a Next.js static export and calls Supabase directly with the public client key; database RLS enforces access. The initial hosted source was synchronized from a sanitized staging checkout at `/private/tmp/device-register-hosted`. No `.env.local`, mobile records, or unused employee photos were uploaded. The public Supabase configuration is compiled into the browser bundle as expected.

Applied design guidance: Appllama app design (adapted for web), Vercel React best practices, Emil Kowalski animate and emil-design-eng, Jakub Krehel better-ui, and transferable SwiftUI accessibility/navigation principles. Google Sans files and their license are bundled from the existing Expo dependency.

Verification: TypeScript, production static build, and four Playwright checks across desktop and mobile. Browser tests use isolated API fixtures, not production records. Empty, populated, and dialog screenshots were inspected. Production deployment was confirmed by the hosting service. A live signed-in cloud write was not performed by the agent.

The mobile app still uses local AsyncStorage. Its records have not been imported or synchronized. Adding a record in either the hosted or local web dashboard writes to the same Supabase project.
