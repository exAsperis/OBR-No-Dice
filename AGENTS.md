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
- On every release, synchronize `package.json`, the stable and local manifests, the versioned manifest filename, `src/version.ts`, and every public manifest `?v=` query. Run `pnpm run check:versions`.
- Publish both `manifest.json` and `manifest-vVERSION.json`. If Owlbear retains a stale stable manifest, remove and re-add the extension using the versioned manifest URL; its versioned popover and icon queries invalidate cached resources.
- Run `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` before delivery.
- Keep the README, manifest URLs, GitHub Pages workflow, and package identity synchronized.
