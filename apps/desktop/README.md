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

## Mail badge and notifications

The macOS Dock badge shows the combined unread inbox count across connected accounts, refreshed about once a minute and on focus. Linux uses the supported launcher badge; Windows does not currently display a numeric badge.

New unread inbox mail produces a native notification while the app is in the background. Clicking it opens that account's inbox. Alerts contain no sender or subject preview. Mail from before app startup or more than five minutes ago is suppressed, and repeated sync results do not replay alerts. Notifications follow the existing mailbox sync schedule (normally about a minute), rather than a server push channel.

The app must remain running; hiding the Mac window is supported, fully quitting stops updates. macOS notifications require a signed app and notification permission in System Settings. Use the OS notification settings to disable alerts or sounds. Both the desktop release and hosted web changes are needed; older desktop versions safely ignore the new integration.


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
