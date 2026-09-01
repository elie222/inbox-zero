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
Pass one or more areas or spec paths when iterating on focused flows:

```sh
pnpm -F inbox-zero-ai test:playwright:emulated mail
pnpm -F inbox-zero-ai test:playwright:emulated mail/layout.spec.ts
pnpm -F inbox-zero-ai test:playwright:emulated automation settings
```

Every emulated product test stores a stable final-state screenshot when it
passes and Playwright's automatic failure screenshot when it fails. The shared
fixture also attaches `browser-evidence` JSON containing the final URL and
title, console errors, uncaught page errors, failed network requests, and HTTP
error responses. Uncaught page errors fail otherwise-passing tests unless a
flow explicitly expects browser errors while simulating a network outage.

Use `capturePlaywrightCheckpoint` from `emulated/playwright-evidence.ts` for
meaningful intermediate states. It writes the screenshot where the public
gallery can compare it with `main` and attaches the same image to the full
Playwright report.

The emulated project runs when browser-facing files change in pull requests or
on `main`, plus the daily schedule and manual dispatches. Pull requests run only
the affected product areas. The selector traces imports from each tested Next.js
route, combines those results with explicit product boundaries, and runs an
entire area when its product code changes or only a spec when that spec changes.
Shared Playwright setup and configuration changes use the full suite. Pushes to
`main`, scheduled runs, and manual runs also keep the full suite as a backstop.

CI captures the final state of every selected test, and tests can add
intentional checkpoint screenshots for important intermediate states. Every
failure also retains its trace and video.

After each pull request run, a trusted follow-up workflow publishes a
screenshot-only gallery, compares its checkpoints with the latest successful
`main` run, and adds or updates a pull request comment with the gallery link.
The full HTML report stays private to the GitHub Actions artifact for pull
requests because it was generated from contributor-controlled code. Successful
and failed `main` runs also publish the full report and visual history to the
public Playwright dashboard:

<https://izghactions.fsn1.your-objectstorage.com/playwright/index.html>
