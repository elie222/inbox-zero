# Playwright tests

Playwright tests are separated by their dependency boundary:

- `emulated/` contains self-contained browser tests. These use seeded local
  emulators and test infrastructure, must not require third-party credentials,
  and are safe to run in CI with `pnpm test:playwright:emulated`.
- Real-provider tests live outside this Playwright harness in `../e2e/`.
  Production-path scenarios against Gmail or Outlook live in `../e2e/flows/`
  and must not use emulator or database shortcuts.

Persist reusable browser QA as executable tests in these suites rather than as
manual Markdown flow specs. Split a scenario at the dependency boundary when
needed: keep deterministic UI state and validation in emulated Playwright, and
keep provider delivery, webhooks, labels, and provider-hosted drafts in the
real-provider E2E suite.

Within `emulated/`, group specs by product area, such as `mail/` or
`automation/`. Keep setup files inside the boundary they support so
real-provider tests cannot accidentally reuse emulated authentication state.

The package-level emulated command runs each spec with a fresh Next process,
emulator, and authenticated mailbox, then merges the reports. Tests inside a
spec remain serial. This avoids state leaking between specs and bounds the
development server's compiled route graph. CI selects the affected specs once
and distributes them across at most 20 matrix jobs. Each job installs dependencies,
browsers, and database services once, then runs its specs sequentially with the
same per-spec isolation. Selections of 20 or fewer specs retain one job per spec.
The selection job lists each batch's specs in its GitHub summary; each test job
reports per-spec durations and exit statuses. A failing spec does not skip the
remaining specs in its batch, and any failure fails the combined `Web E2E` check.
CI bounds each Playwright invocation to eight minutes, including cold web-server
startup and authentication setup. Each job gets four additional minutes for
dependency installation and artifact handling, plus eight minutes per selected spec.
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
the affected product areas and features. The selector traces imports from each
tested Next.js route and combines those results with explicit product boundaries.
An area's optional `coverage.json` maps each spec filename to the app-relative
component or hook entry points that its assertions and screenshots exercise.
For example, the mail split-tabs spec owns `SplitTabs.tsx`; changes to that
component or its imported split picker select the same spec. Multiple matching
specs are combined, including any specs directly changed by the PR.

Declare the feature being exercised, rather than its whole page or shell, and
reuse existing specs and screenshot checkpoints. Shared app dependencies, route
entry points, and area files with no matching feature keep the whole area.
Missing entry points or a spec without a declaration also disable narrowing for
that area. Areas without a manifest retain their existing selection behavior.
Mail is the first area with feature declarations. Explicit shared-feature entry
points in `sharedFeatureMappings` use focused cross-page coverage: command-palette
changes run its command, starring, theme, and settings-dialog specs. This mapping
does not extend to those entry points' imported foundations. Missing target specs
fall back to broad coverage, and other files in the PR still add their own tests.

On PRs, UI dependencies under `utils/` and `lib/` also trigger selection; unrelated
utilities with no connection to tested routes are skipped. Unit-test changes
alone do not select browser tests.
Shared Playwright setup and configuration changes use the full suite. Pushes to
`main`, scheduled runs, and manual runs also keep the full suite as a backstop.

Run `node apps/web/scripts/measure-playwright-selection.mjs` from the repository
root to record selected spec counts for representative changes. An optional
first argument loads another selector module, allowing before/after comparisons
against the same source tree. These are spec-count measurements, not wall-clock
predictions; see [the initial comparison](selection-comparison.md).

CI captures the final state of every selected test, and tests can add
intentional checkpoint screenshots for important intermediate states. Every
failure also retains its trace and video.

After each pull request run, a trusted follow-up workflow publishes a
screenshot-only gallery, compares its checkpoints with the latest successful
`main` run, and adds or updates a pull request comment with the gallery link.
The comment also embeds the frames most worth a look: failure captures, new
checkpoints, changed checkpoints from specs the pull request touched, and the
changed checkpoints with the largest share of differing pixels against `main`.
Hash comparison alone flags most captures as changed because of timestamps and
other drift, so the pixel ranking is what surfaces real visual changes.
The full HTML report stays private to the GitHub Actions artifact for pull
requests because it was generated from contributor-controlled code. Successful
and failed `main` runs also publish the full report and visual history to the
public Playwright dashboard. Galleries accept up to 500 PNGs totaling 100 MiB;
individual image validation and artifact traversal limits also apply. This
allows full-suite galleries with more than 100 checkpoints without unbounded
artifact processing.


<https://izghactions.fsn1.your-objectstorage.com/playwright/index.html>
