# Dependency patches

`@inbox-zero__emulate@0.11.1.patch` makes the Google emulator issue RS256 identity tokens and publish the matching public JWKS. Version 0.11.1 otherwise issues HS256 tokens and publishes an empty JWKS, which Better Auth 1.7 correctly rejects. This changes only the development emulator; application identity-token verification remains enabled.

Remove this patch after upgrading to an emulator release with verifiable Google identity tokens. Validate with `RUN_INTEGRATION_TESTS=true pnpm --dir apps/web exec vitest run __tests__/integration/google-emulator-oauth.test.ts` and the Playwright login flow.
