# Requested Skill Sources

Loaded for this task from the public repositories named by the user. The full skill bundles are in `/private/tmp/device-management-requested-skills/`; these are session references, not global Codex installations.

| Source | Applied guidance |
| --- | --- |
| https://github.com/expo/skills | SDK-compatible installs, SwiftUI/Compose-backed selectors, SF Symbols on iOS, native stack navigation, scroll insets and reachable keyboard actions. |
| https://github.com/Appllama/appllama-skills | Consistent screen hierarchy, native navigation semantics, visible state/recovery, continuous corners, unsaved-form protection and persistent primary registration action. |
| https://github.com/emilkowalski/skills | Frequent actions get minimal feedback; 120ms transform/opacity press feedback on the UI runtime, native navigation transitions, Reduce Motion handling and restrained selection haptics. |
| https://github.com/vercel-labs/agent-skills | Virtualized inventory, memoized primitive row props, stable callbacks, memoized filtering and context value. No layout animation in recycled rows. |
| https://github.com/twostraws/SwiftUI-Agent-Skill | Reviewed accessibility and navigation principles. Native iPhone selectors use SwiftUI through Expo UI; this remains a React Native app, not a separate Swift project. |

The supplied Soun brand reference overrides generic color/type preferences. Existing React Navigation is retained rather than migrating the app to Expo Router solely for skill conventions. Native platform APIs are preferred; the inventory stays virtualized with FlatList because its unknown-length contents require recycling rather than a native fixed-row settings list.

Verification limits: no Appllama MCP connection, no local iOS Simulator/Android emulator, and no release-build motion recording. Appllama's requirement to inspect screenshots and record the complete flow is pending. No measured frame-rate or pixel-fidelity claim is made. TypeScript, domain/filter regression tests, actual StackRouter back-navigation tests and both platform bundles are checked separately.
