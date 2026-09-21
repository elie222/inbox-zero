# Dependency patches

`@inbox-zero__emulate@0.11.1.patch` makes the Google emulator issue RS256 identity tokens and publish the matching public JWKS. Version 0.11.1 otherwise issues HS256 tokens and publishes an empty JWKS, which Better Auth 1.7 correctly rejects. This changes only the development emulator; application identity-token verification remains enabled.

Remove this patch after upgrading to an emulator release with verifiable Google identity tokens. Validate with `RUN_INTEGRATION_TESTS=true pnpm --dir apps/web exec vitest run __tests__/integration/google-emulator-oauth.test.ts` and the Playwright login flow.

`@sqlite.org__sqlite-wasm@3.53.4-build1.patch` aligns the legacy worker's proxy construction with the primary initializer's static proxy asset URL. Turbopack otherwise treats its dynamic URL as a worker module dependency and fails compilation even when only the package's default SQLite initializer is used. Mail search uses SAHPool; the legacy proxy is not instantiated by the application. Remove after upgrading to a release with the same bundler-compatible legacy worker implementation, and validate with the emulated local search browser suite.

`@better-auth__oauth-provider@1.7.4.patch` accepts host-bearing native redirect URIs such as Cursor's `cursor://anysphere.cursor-mcp/oauth/callback`. Better Auth 1.7.4 only allows authority-free reverse-domain schemes (`com.example.app:/callback`). Remove after upgrading to a release that includes https://github.com/better-auth/better-auth/pull/10956, and validate with `pnpm test utils/mcp/oauth-flow.test.ts`.
