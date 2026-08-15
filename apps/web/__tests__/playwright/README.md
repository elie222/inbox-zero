# Playwright tests

Playwright tests are separated by their dependency boundary:

- `emulated/` contains self-contained browser tests. These use seeded local
  emulators and test infrastructure, must not require third-party credentials,
  and are safe to run in CI with `pnpm test:playwright:emulated`.
- `flows/` is reserved for production-path tests against real Gmail or Outlook
  accounts and their real webhook delivery. Do not use emulator or database
  shortcuts in these tests.

Within either boundary, group specs by product area, such as `mail/` or
`automation/`. Setup files should remain inside the boundary they support so
real-provider flows cannot accidentally reuse emulated authentication state.
