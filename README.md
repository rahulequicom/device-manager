# Device Management App

The native mobile app lives in `mobile/` and uses Expo + React Native + TypeScript. It has native navigation, barcode scanning, system confirmations and the native share sheet.

The admin web dashboard lives in `web/` and uses Next.js + React + TypeScript with Supabase authentication and persistence. Setup instructions and the database migration are in `supabase/README.md`. Completed mobile registrations sync through Supabase and appear in the authenticated web inventory after the mobile-sync migration is applied.

## Run the admin dashboard

```sh
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Run on a phone

```sh
cd mobile
npm install
npm start
```

Open Expo Go on Android and scan the terminal QR code. On iPhone, scan with the Camera app and open in Expo Go. Phone and computer must be on the same network. Expo Go must support the installed SDK (57); otherwise use a compatible development build.

## Checks

```sh
cd mobile
npm run typecheck
npm test
npx expo export --platform ios --platform android
```

All eight supplied fields are retained. The supplied iPhone is the initial record. Team members are placeholders (Mobile: 5, QA: 10, Design: 4). Assign, transfer and return update the holder and append history. Duplicate serial numbers and barcode codes are rejected. Records are saved before the UI reports success.

AsyncStorage remains the mobile offline cache; completed saves also submit a snapshot to the Supabase mobile intake table. History actions on mobile are attributed to `Local coordinator`. Camera scanning requires permission; manual entry is always available. The initial device's lookup code is its supplied serial number, pending an actual asset label.

For box scanning, use the Serial Number or IMEI barcode. EAN/UPC product codes are not unique phone identifiers and trigger a retry prompt. Recognized serial label prefixes are supported. Unrecognized individual-device codes can be linked to an existing record after confirmation; the original serial and barcode remain searchable, and the link is logged. Box codes do not automatically provide OS version, Wi-Fi address or Bluetooth address; those remain registered fields.

Share links use `device-register://device/<id>` and require an installed development/production build with that scheme; recipients also need the same device record. Expo Go does not register the custom scheme. Replace the placeholder bundle identifier before distribution.

Verified: TypeScript, domain tests, Android and iOS JavaScript bundle exports. Physical camera scanning, gestures and visual layouts need a real-device check; this machine has no simulator configured. Bundle export is not a signed APK or IPA.

The current design follows the Soun reference: black and neutral surfaces, white text, blue primary actions, supporting magenta/orange team accents, and bundled Google Sans. `mobile/BRAND.md` contains the tokens. `mobile/SKILLS.md` records the requested skill sources and verification limits.

Devices is the permanent root. All registered records appear under All / All teams. Active search and filters are visible and can be cleared. Every detail or task screen has native Back/Cancel plus an All devices toolbar action. Registration, successful scans and label links land on Details with Devices underneath. Unsaved form changes require confirmation before being discarded. Lists and scroll views have explicit flexible height, so persistent controls cannot consume the inventory area.

The original HTML prototype is retained at the project root. It is not the mobile app.

Worklet startup is configured explicitly in `mobile/babel.config.js`: the Expo preset's automatic worklet insertion is disabled and the matching Worklets plugin is added once. After adding native animation packages or changing Babel configuration, restart with `npm start -- --clear`. The worklet regression test checks startup unpacker metadata. This repairs the missing `__initData.code` initialization seen in the stale lazy-loaded iPhone bundle; clearing Metro's transform cache does not clear saved device records.

The introduction follows the approved swipe-driven ASCII sequence on a white background. It starts with a fully visible glass bubble bobbing above the immediately visible "Swipe up to get started" prompt. The first upward swipe (or accessible prompt tap) reveals 20 company-member portraits in reflective glass bubbles, rising into a floating cluster above the approved copy. Only after this reveal does the black Continue with work email CTA appear. Further swipes do not bypass sign-in. The two side bubbles below the copy are intentionally absent. Dragging and floating run on the UI runtime; canceled drags spring back with release velocity. Reduce Motion replaces spatial motion with a short fade. Existing users can replay the scene using the information button on Devices without resetting saved records. The white canvas and black primary actions now apply across the native app, including headers, forms, status bars and native controls.

The motion was revised after phase-by-phase inspection of the Pinterest video on 13 October. Opening progress now tracks the finger continuously and reverses when a short/canceled drag returns home. The sphere deforms, magnifies the emerging copy, contracts above it, and then emits employee bubbles along staggered curved paths. The copy and CTA fade in during the release instead of appearing together after it. The small sphere remains visible and can be dragged through the copy; nearby photo bubbles respond locally to touch. A native clipped-band magnification layer approximates curved-glass text distortion without adding an unverified native rendering dependency. It is not a physically ray-traced lens or a full collision simulation. Reduced Motion removes the lens warp, spatial emission and continuous bobbing. Physical-device video review is still required to judge fidelity and smoothness; native exports and unit tests are not a substitute for that review.

Continue with work email opens a labeled email-entry screen with validation and a real Back path. Company identity-provider verification is not configured yet. Submitting a valid address reports that sign-in is unavailable; it does not save the email, mark the user authenticated, set introduction completion, send an external request, or open Devices. An approved company provider and its client/backend configuration are required to enable production sign-up/login. The legacy introduction-seen key is retained for existing local prototype users; this is not an authentication mechanism.

Profile images were downloaded locally from the authenticated Zoho Cliq Technology view: 28 non-default profile images and two default avatars. The intro uses only non-default images, without remote photo requests or external image-processing uploads. These are thumbnail-resolution assets. Layout, theme, identity-verification guard, gesture, worklet, model, and navigation regression tests plus iOS/Android exports verify code behavior; current physical-device visual fidelity and motion testing remain outstanding.
