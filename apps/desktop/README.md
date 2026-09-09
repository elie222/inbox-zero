# Desktop app

Electron shell for the hosted Inbox Zero web app.

## Run

Against production:

```sh
pnpm --filter @inboxzero/desktop dev
```

Against a local web app:

```sh
INBOX_ZERO_APP_URL=http://localhost:3000 pnpm --filter @inboxzero/desktop dev
```

Sign-in uses the system browser and returns through `inboxzero://`. The web app's `DESKTOP_AUTH_ORIGIN` defaults to this scheme.

## Package

```sh
pnpm --filter @inboxzero/desktop dist:mac
pnpm --filter @inboxzero/desktop dist:win
```

Installers land in `apps/desktop/release/`. macOS packaging requires a Developer ID certificate and notarization credentials.

## Release

Push a `desktop-v*` tag to build and publish a release, or run the [Desktop Release workflow](../../.github/workflows/desktop-release.yml) manually with optional publishing. It packages macOS (DMG/ZIP) and Windows (NSIS) for arm64 and x64.

The macOS release requires these GitHub secrets:

- `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` — Developer ID Application `.p12` (base64) for signed Mac builds
- `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` / `APPLE_API_KEY_P8` / `APPLE_TEAM_ID` — Apple credentials used to notarize the signed build

Windows signing uses `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` for the Authenticode `.p12`.

Auto-update metadata (`latest-mac.yml` / `latest.yml`) is published to the `desktop-updates` release; installers stay on `desktop-v*` releases.
