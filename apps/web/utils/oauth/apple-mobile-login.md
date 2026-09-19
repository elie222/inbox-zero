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

1. The native app generates a random PKCE verifier, retains it locally, and sends its S256 `codeChallenge` to `POST /api/mobile-auth/start`.
2. Better Auth redirects to `/api/mobile-auth/callback?state=...` after the provider callback.
3. The callback route stores a short-lived one-time code and redirects to `/auth-callback?code=...&state=...`.
4. The native app redeems the code with `POST /api/mobile-auth/exchange-code`, sending `code`, `state`, and its retained `codeVerifier`.

Session cookies must not be placed in mobile callback URLs.

The server requires a matching, successful provider completion and the same newly issued browser session before creating a handoff code. Unissued, expired, pending, or already consumed state is rejected. Codes expire after five minutes and can be redeemed once with the initiating client's verifier.

The S256 challenge is unpadded base64url of SHA-256 of the verifier. Generate a fresh verifier from at least 32 random bytes per attempt (43–128 RFC 7636 characters). Never send it in the authorization URL or app callback. Retain it alongside the expected state until exchange succeeds or the attempt is abandoned, and reject callbacks for a different state.

Desktop clients send `codeChallenge` in the `/api/mobile-auth/browser-start` query and `codeVerifier` during exchange. The desktop process retains the verifier in memory; if it quits during sign-in, start a fresh attempt.

Deploy this contract with updated native clients. Clients that omit the challenge or verifier are rejected; there is no legacy bearer-code fallback. In-progress flows from an older server version must restart. Direct native Apple ID-token sign-in does not use these handoff endpoints.
