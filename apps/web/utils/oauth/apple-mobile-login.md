# Apple Mobile Login

This setup is only for the first-party Inbox Zero mobile app. Self-hosted web deployments do not need these values.

The backend accepts native Sign in with Apple ID tokens from the mobile app through Better Auth. Configure these env vars only in hosted environments that serve the mobile app:

```sh
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APPLE_APP_BUNDLE_IDENTIFIER=com.getinboxzero.app
MOBILE_AUTH_ORIGIN=inboxzero://
ANDROID_APP_CERT_SHA256_FINGERPRINTS=
```

- `APPLE_CLIENT_ID` is the Apple Services ID used for the web OAuth fallback.
- `APPLE_TEAM_ID` is the Apple Developer team ID.
- `APPLE_KEY_ID` is the Sign in with Apple key ID.
- `APPLE_PRIVATE_KEY` is the `.p8` key body. Escaped `\n` newlines are supported.
- `APPLE_APP_BUNDLE_IDENTIFIER` must match the iOS app bundle ID.
- `MOBILE_AUTH_ORIGIN` is the deep-link origin trusted by mobile Better Auth requests and used only for local non-HTTPS callback redirects.
- `ANDROID_APP_CERT_SHA256_FINGERPRINTS` is a comma-separated list of Android app signing certificate SHA-256 fingerprints served from `/.well-known/assetlinks.json`.

The Apple client secret is generated at runtime from the team ID, key ID, private key, and client ID. Do not add a static `APPLE_CLIENT_SECRET`.

Mobile browser OAuth must use the backend handoff flow:

1. Better Auth redirects to `/api/mobile-auth/callback?state=...` after the provider callback.
2. The callback route stores a short-lived one-time code and redirects to `/auth-callback?code=...&state=...`.
3. The native app redeems the code with `POST /api/mobile-auth/exchange-code`.

Session cookies must not be placed in mobile callback URLs.
