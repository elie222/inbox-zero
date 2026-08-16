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

The package-level emulated command runs each product area with a fresh Next and
emulator process, then merges their reports. This prevents the development
server's compiled route graph from exhausting its heap during the full suite.
Run a spec directly with Playwright when iterating on one flow.

The emulated project runs when browser-facing files change in pull requests or
on `main`, plus the daily schedule and manual dispatches. Pull requests retain
the HTML report, screenshots, traces, and videos as GitHub Actions artifacts.
Intentional checkpoint screenshots are attached when their test file changed
in a pull request or push. Every test still captures a screenshot on failure.
Runs on `main` also publish a persistent report history to the public
Playwright dashboard:

<https://izghactions.fsn1.your-objectstorage.com/playwright/index.html>
