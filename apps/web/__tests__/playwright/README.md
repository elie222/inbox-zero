# Playwright tests

Playwright tests are separated by their dependency boundary:

- `emulated/` contains self-contained browser tests. These use seeded local
  emulators and test infrastructure, must not require third-party credentials,
  and are safe to run in CI with `pnpm test:playwright:emulated`.
- Real-provider tests live outside this Playwright harness in `../e2e/`.
  Production-path scenarios against Gmail or Outlook live in `../e2e/flows/`
  and must not use emulator or database shortcuts.

Within `emulated/`, group specs by product area, such as `mail/` or
`automation/`. Keep setup files inside the boundary they support so
real-provider tests cannot accidentally reuse emulated authentication state.
