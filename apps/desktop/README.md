# Desktop app

Electron shell around the hosted Inbox Zero web app. There is no backend in this package: the window loads the same Next.js origin a browser does.

## Run

Against production:

```sh
pnpm --filter @inboxzero/desktop dev
```

Against a local web app:

```sh
INBOX_ZERO_APP_URL=http://localhost:3000 pnpm --filter @inboxzero/desktop dev
```

Sign-in opens the system browser, then returns through `inboxzero://` and `/api/mobile-auth/exchange-code`. Google and Microsoft OAuth are not completed inside the Electron window.

The web app defaults `DESKTOP_AUTH_ORIGIN` to `inboxzero://`, the same scheme as mobile. Override that only if the desktop protocol scheme changes.

## Package

```sh
pnpm --filter @inboxzero/desktop dist:mac
pnpm --filter @inboxzero/desktop dist:win
```

Installers land in `apps/desktop/release/`. Unsigned local builds are fine for testing; macOS Gatekeeper will warn until the app is signed and notarized.

## Release

Push a `desktop-v*` tag or run the **Desktop Release** workflow. That builds macOS (dmg/zip, arm64 + x64) and Windows (NSIS, x64 + arm64) and can publish a GitHub Release.

Signing is optional until these GitHub secrets exist:

- `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` — Developer ID Application `.p12` (base64) for notarizable Mac builds
- `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` — Windows Authenticode `.p12` (base64)

Notarization is off until those Mac secrets are in place. Same Apple Developer team as the iOS app can issue the Developer ID certificate; that is not a Mac App Store build.
