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

The window remembers the last in-app page (stored in `userData/last-app-url`) and restores it on launch instead of going through `/login` redirects. On macOS, closing the window hides it so reopening from the dock is instant; quit with Cmd+Q.

The web app defaults `DESKTOP_AUTH_ORIGIN` to `inboxzero://`, the same scheme as mobile. Override that only if the desktop protocol scheme changes.

## Package

```sh
pnpm --filter @inboxzero/desktop dist:mac
pnpm --filter @inboxzero/desktop dist:win
```

Installers land in `apps/desktop/release/`. Use `pnpm dev` for unsigned local testing; packaged macOS builds require the Developer ID certificate configured below.

The Mac app is distributed directly as a signed and notarized DMG/ZIP. It is not a Mac App Store build, so it does not use Apple's App Sandbox or Mac App Store update and payment policies.

## Release

Push a `desktop-v*` tag or run the **Desktop Release** workflow. That builds macOS (dmg/zip, arm64 + x64) and Windows (NSIS, x64 + arm64) and can publish a GitHub Release.

The macOS release requires these GitHub secrets:

- `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` — Developer ID Application `.p12` (base64) for signed Mac builds
- `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` / `APPLE_API_KEY_P8` / `APPLE_TEAM_ID` — Apple credentials used to notarize the signed build

Windows signing uses `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` for the Authenticode `.p12`.

`electron-builder.yml` keeps `mac.notarize` enabled. App Store Connect API credentials are also accepted by Apple's notarization service; using them here does not make the output a Mac App Store build.

Packaged apps check `https://github.com/elie222/inbox-zero/releases/download/desktop-updates` for `latest-mac.yml` / `latest.yml`. That feed is a stable GitHub release; the installers stay on `desktop-v*` releases.
