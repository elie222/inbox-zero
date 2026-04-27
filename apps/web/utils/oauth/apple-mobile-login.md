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
```

- `APPLE_CLIENT_ID` is the Apple Services ID used for the web OAuth fallback.
- `APPLE_TEAM_ID` is the Apple Developer team ID.
- `APPLE_KEY_ID` is the Sign in with Apple key ID.
- `APPLE_PRIVATE_KEY` is the `.p8` key body. Escaped `\n` newlines are supported.
- `APPLE_APP_BUNDLE_IDENTIFIER` must match the iOS app bundle ID.
- `MOBILE_AUTH_ORIGIN` is the deep-link origin trusted by Better Auth Expo.

The Apple client secret is generated at runtime from the team ID, key ID, private key, and client ID. Do not add a static `APPLE_CLIENT_SECRET`.
