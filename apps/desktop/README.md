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

Sign-in opens the system browser, then returns through `inboxzero-desktop://` and `/api/mobile-auth/exchange-code`. Google and Microsoft OAuth are not completed inside the Electron window.

The web app defaults `DESKTOP_AUTH_ORIGIN` to `inboxzero-desktop://`. Override that only if the desktop protocol scheme changes.
