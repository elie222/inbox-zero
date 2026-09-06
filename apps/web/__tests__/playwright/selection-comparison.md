# Browser selection comparison

Measured on the source tree at `0a8a54d7d` (2026-09-07), comparing its original
selector with feature coverage declarations. Both selectors received the same
changed-file scenarios and the same application source tree. No tests or
screenshot checkpoints were removed.

| Change | Before: spec jobs | After: spec jobs | Fewer jobs | Historical runner-minutes: before → after |
| --- | ---: | ---: | ---: | ---: |
| Split tabs | 16 | 1 | 93.8% | 61.0 → 3.5 |
| Nested split picker | 16 | 1 | 93.8% | 61.0 → 3.5 |
| Sender profile | 16 | 1 | 93.8% | 61.0 → 3.6 |
| Sender profile hook | 16 | 1 | 93.8% | 61.0 → 3.6 |
| Label picker | 16 | 1 | 93.8% | 61.0 → 3.6 |
| Sidebar | 16 | 2 | 87.5% | 61.0 → 7.0 |
| Split tabs and sender profile | 16 | 2 | 87.5% | 61.0 → 7.2 |
| Mail shell | 16 | 16 | 0.0% | 61.0 → 61.0 |
| Shared button | 37 | 37 | 0.0% | 129.7 → 129.7 |
| Lockfile | 37 | 37 | 0.0% | 129.7 → 129.7 |

Spec counts are measured selector outputs. Runner-minutes are an estimate formed
by summing the durations of the selected spec jobs from the same
[successful full-suite CI run](https://github.com/elie222/inbox-zero/actions/runs/34062589569).
Those job durations include runner setup and tests, exclude queue time, and do
not include the shared selection/report jobs. They measure total runner work,
not elapsed PR time: jobs execute concurrently. They are not fresh timings for
the new selection policy.

That reference run took 12m03s end to end, with five minutes waiting for the last
runner. Reducing the number of requested runners should reduce contention, but
this comparison does not establish a five- or ten-minute wall-clock guarantee.

The PR that changes the selector still runs the full suite intentionally, because
selection-infrastructure changes require the broad backstop. Its own workflow
duration therefore is not a measurement of a normal one-feature PR.

## Reproduce the selected spec counts

From the repository root:

```sh
node apps/web/scripts/measure-playwright-selection.mjs > after.json
node apps/web/scripts/measure-playwright-selection.mjs /path/to/baseline/apps/web/utils/playwright/emulated-suite-selection.mjs > before.json
```

The optional module path changes only the selector implementation. Both runs
analyze the current application's source tree, so unrelated product changes do
not distort the comparison. Each JSON row records the changed files and exact
selected specs as well as the count.

## Coverage retained

- The existing mail specs still produce their normal PR screenshot galleries.
- Component dependencies are traced: the nested split picker and sender-profile
  hook inherit their feature's coverage without individual file mappings.
- Changes spanning features select their union.
- Mail-shell changes retain all 16 mail specs; common app dependencies and
  lockfile changes retain all 37 specs.
- Invalid manifests, missing feature roots, and new undeclared specs fall back
  to the full area. Other product areas retain their existing routing until
  they declare feature coverage.
- Scheduled and main-branch runs retain the full suite.
