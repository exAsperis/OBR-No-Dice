# OBR Extension Project Instructions

This repository began from the reusable React, TypeScript, and Vite Owlbear Rodeo extension template.

Before implementing extension-specific behavior:

1. Replace the template name in `package.json`, `index.html`, `extension.html`, `src/constants.ts`, `manifest-local.json`, and both public release manifest files.
2. Set `EXTENSION_ID` to `com.ex-asperis.{extension-name}`, where `{extension-name}` is the lowercase display name with non-alphanumeric runs converted to hyphens. Derive every metadata namespace and Owlbear registration ID from this constant; never introduce a second reverse-domain namespace.
3. Replace `OBR-Extension-Template` and `exAsperis` in every absolute manifest URL with the new GitHub repository and owner, update the homepage, and customize the icon.
4. Set the published author to exactly `ex Asperis` in the manifest and any extension-store submission metadata.
5. Run `pnpm run check:identity` once immediately after renaming the copied template and fix every failure before implementing features. This is the required creation-time identity verification.
6. Decide whether the extension is available to all players or restricted to the GM; enforce that decision before reading sensitive data.
7. Identify which SDK state is room-, scene-, player-, or item-scoped. Handle the valid no-scene state explicitly.

Preserve these invariants:

- Keep the Owlbear SDK behind `OBR.onReady`.
- Unsubscribe every `onChange` listener during React effect cleanup.
- Use Owlbear theme variables with usable CSS fallbacks.
- Do not expose secrets in browser code or log user/room metadata.
- Build all metadata keys as `${EXTENSION_ID}/...` so every namespace remains under `com.ex-asperis.{extension-name}`.
- Keep Vite's relative build base, but use absolute hosted URLs in Owlbear manifests. Do not use `./` for manifest popover or icon URLs.
- Follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) for the extension's public behavior: its install manifest, expression language, roll results, and documented broadcast API. Keep `MAJOR.MINOR.PATCH` versions, without leading zeroes.
- While the project is in `0.y.z`, increment MINOR for new features or incompatible behavior and PATCH for compatible fixes. After `1.0.0`, increment MAJOR for incompatible public changes, MINOR for compatible features, and PATCH for compatible fixes. Reset lower components when incrementing a higher component. Do not silently reuse a released version for changed runtime behavior.
- Choose the version before delivering a change. Bump once for the complete set of changes since the last release; documentation-only edits may share the current version when they do not change runtime behavior. Explain any compatibility impact in the README and update protocol message versions separately if their wire format becomes incompatible.
- On every version bump, synchronize `package.json`, the stable and local manifests, `src/version.ts`, every hosted manifest `?v=` query, and the README's versioned manifest reference. Create `public/manifest-vVERSION.json` as an exact copy of the current stable manifest. Keep older versioned manifest files unchanged; never overwrite a published versioned manifest.
- Run `pnpm run check:versions` after every version bump. It must verify SemVer syntax and all synchronized version fields before a production build.
- Publish both `manifest.json` and `manifest-vVERSION.json`. If Owlbear retains a stale stable manifest, remove and re-add the extension using the versioned manifest URL; its versioned popover and icon queries invalidate cached resources.
- Run `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` before delivery.
- Keep the README, manifest URLs, GitHub Pages workflow, and package identity synchronized.
