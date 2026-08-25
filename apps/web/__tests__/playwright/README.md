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
on `main`, plus the daily schedule and manual dispatches. CI captures the final
state of every test, and tests can add intentional checkpoint screenshots for
important intermediate states. Every failure also retains its trace and video.

After each pull request run, a trusted follow-up workflow publishes a
screenshot-only gallery, compares its checkpoints with the latest successful
`main` run, and adds or updates a pull request comment with the gallery link.
The full HTML report stays private to the GitHub Actions artifact for pull
requests because it was generated from contributor-controlled code. Successful
and failed `main` runs also publish the full report and visual history to the
public Playwright dashboard:

<https://izghactions.fsn1.your-objectstorage.com/playwright/index.html>
