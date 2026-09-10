# Mail loading simulation

Runs the unchanged email client in Chromium, through the real application routes
and Gmail provider, against emulate.dev with a local quota/latency proxy. Opt-in:
the dedicated config is only used by `test:mail-loading`. Normal Playwright and
Vitest discovery exclude these scenarios; no CI workflow invokes the command.

```sh
pnpm install
# Use a disposable local Postgres database with this repository's migrations.
# PREVIEW_DATABASE_URL_UNPOOLED takes precedence over other Prisma URLs.
PREVIEW_DATABASE_URL_UNPOOLED="$SIMULATION_DATABASE_URL" pnpm -F inbox-zero-ai exec prisma migrate deploy
DATABASE_URL="$SIMULATION_DATABASE_URL" \
  UPSTASH_REDIS_URL="$SIMULATION_REDIS_URL" UPSTASH_REDIS_TOKEN="$SIMULATION_REDIS_TOKEN" \
  pnpm -F inbox-zero-ai test:mail-loading
node --test apps/web/__tests__/playwright/mail-simulation/quota-proxy.test.mjs
```

The standard Playwright harness starts its development server. Run on an idle
machine; first-route compilation is included in cold-view measurements. Supply
local Redis to exercise account cooldowns; without it the application's shared
rate-limit protection is disabled. Each run has a fresh synthetic account.

## Workload and evidence

The seed contains 1,000 threads: short messages, eight-message conversations, a
150-message conversation, and a roughly 850 KB HTML newsletter. All/Unread splits
overlap. Scenarios open arbitrary visible rows immediately, revisit a thread,
navigate J/K rapidly, switch splits twelve times, scroll in both directions,
and open another tab in the same browser context. A constrained phase exhausts
quota during an uncached open and then restores capacity to observe recovery.

Three profiles run the same baseline interactions: generous quota with latency,
the currently published quota, and forced exhaustion after warmup. Each profile
starts a fresh dev server, emulator, synthetic account and browser context, so
pending requests, label mutations and Redis cooldowns do not leak between profiles.
Artifacts for all three runs are preserved under `.tmp/mail-simulation/<run>/`.

For one profile, run `pnpm -F inbox-zero-ai test:mail-loading latency`.
The other profile names are `published-quota` and `constrained`; multiple names
can be passed to run a subset. Reports are written directly into the simulation
run folder, leaving normal Playwright reports untouched.

Playwright attaches `mail-loading-summary.json`, `gmail-requests.json`, a screenshot,
and its standard browser diagnostic evidence. The summary records action-to-body
observations, application detail-request counts, accepted quota units, rejected
provider calls, bytes, and peak concurrency. A body is ready only when its unique
synthetic marker is visible in the actual reader or email iframe. Timings include
Playwright action/polling overhead and are upper bounds, not precise paint timing
or a statistically meaningful p95. `loaded: false` means the body was not visible
within 12 seconds; it is a finding, not a successful load. When a reader error removes navigation, an annotation records that remaining
scenarios were blocked. Other structural failures still fail the test, while
slow/failed loads are recorded to keep a baseline
usable before client fixes. Inspect the JSON and annotations even when Playwright passes.
Provider counters are snapshots at action completion; unfinished admitted requests
are reported separately, so byte totals can still be growing.

## Quota model and limits of fidelity

Sources, checked 2026-09-10:

- https://developers.google.com/workspace/gmail/api/reference/quota
- https://developers.google.com/workspace/gmail/api/guides/handle-errors
- https://developers.google.com/workspace/gmail/api/guides/batch

The dedicated config requires a loopback HTTP provider URL with an explicit port;
remote providers and HTTPS are not supported. OAuth callback URLs are normalized.

The published schedule uses 6,000 units per user/project/minute and 1,200,000 per
project/minute; `threads.get` costs 40. Existing Cloud projects can retain older
quotas. Configure the ledger with the actual project's settings before drawing
production capacity conclusions.

The proxy uses a rolling 60-second window, counts every admitted attempt, and
meters GET batch parts individually. Batches can return HTTP 200 with individual
403/429 failures. Rejected admissions do not consume the simulated quota. This
is an explicit model, not Google's undisclosed window/admission algorithm.
Quota rejections return the delay until sufficient weighted capacity expires;
concurrency rejections use a one-second backoff. A budget smaller than one request
requires a manual reset and uses the configured window as its retry interval.

Latency defaults to 250 ms and transfer delay to 2 MB/s per response. Concurrent
batch parts count separately. The main profiles set the concurrency threshold to 100 to isolate quota and
latency behavior; forced exhaustion uses 2. The threshold is a stress parameter:
Google documents the limit without specifying a numeric threshold. Transfer delay
is not a model of Gmail's daily bandwidth cap or aggregate connection bandwidth.
The single seeded mailbox shares one ledger identity across tabs and OAuth tokens;
project sharing across users is covered by the ledger test, not a multi-user
browser workload. The app's own mailbox sync runs normally and competes with foreground requests.
External-client load and automation are not yet replayed.

Only Gmail traffic is metered; OAuth/other services pass through. Unsupported
Gmail methods or batch writes fail explicitly. The test-only control endpoint
`/__simulation` reads the ledger or resets it once requests finish. Resets between
phases are artificial quota restoration; they do not clear the application's
Redis cooldown. All fixture content is synthetic. No production client, cache,
prefetch, prompt, or tool behavior is changed.
