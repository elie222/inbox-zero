# S04: Daily Digest

**Goal:** Daily 9am ET email digest with AI-generated narrative, urgent flags, and auto-filed roll-ups
**Demo:** Digest email arrives at 9am ET with correct content tiers; no duplicate sends; Marketing emails included

## Must-Haves

- Complete the planned slice outcomes.

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Spec lock, test scaffolds, DigestItem instrumentation** `est:0.5d`
  Rewrite stale REQUIREMENTS.md spec, scaffold 5 failing test files, add structured logging at DigestItem creation site
  - Files: `apps/web/utils/digest/instrumentation.ts`, `apps/web/__tests__/cron/digest.test.ts`, `apps/web/__tests__/digest/idempotency.test.ts`
  - Verify: Test files exist; logging wired into DIGEST action handling

- [x] **T02: DigestSend model and migration** `est:0.5d`
  Add DigestSend model to Prisma schema, ship migration. Idempotency source-of-truth for one-send-per-day.
  - Files: `apps/web/prisma/schema.prisma`, `apps/web/prisma/migrations/`
  - Verify: Migration applied; DigestSend.findUnique works

- [x] **T03: Deploy-time SQL patches** `est:0.5d`
  Two idempotent SQL files: (1) add DIGEST action to Marketing rule, (2) backfill 218 stale Digest rows as SENT
  - Files: `deploy/sql/2026-05-04-add-marketing-digest-action.sql`, `deploy/sql/2026-05-04-backfill-218-digests.sql`, `deploy/sql/README.md`
  - Verify: SQL files committed, idempotent, run against prod at deploy time

- [x] **T04: Sonnet batched content generator** `est:1d`
  One LLM call per digest producing full structured output: narrative + Urgent/Uncertain summaries + auto-filed clusters
  - Files: `apps/web/utils/ai/digest/digest-schema.ts`, `apps/web/utils/ai/digest/digest-prompt.ts`, `apps/web/utils/ai/digest/generate-digest-content.ts`
  - Verify: generateDigestContent returns DigestContent struct; cost ~$0.08/digest

- [x] **T05: End-to-end digest send pipeline** `est:1d`
  Wire cron route: query un-SENT Digest rows, fetch Gmail bodies, bucket by rule, call generateDigestContent, send via Resend, commit SENT + DigestSend atomically
  - Files: `apps/web/app/api/cron/digest/route.ts`, `apps/web/utils/digest/run-daily-digest.ts`, `apps/web/utils/digest/digest-send.ts`, `packages/resend/src/send.tsx`
  - Verify: Full pipeline fires end-to-end; idempotency enforced via DigestSend findUnique

- [x] **T06: Systemd timer on EC2** `est:0.5d`
  systemd timer hits /api/cron/digest at 09:00 America/New_York daily. Install + enable on EC2 host.
  - Files: `deploy/systemd/inbox-zero-digest.service`, `deploy/systemd/inbox-zero-digest.timer`, `deploy/systemd/README.md`
  - Verify: Timer installed, enabled, first real digest arrives at 9am ET

## Files Likely Touched

- apps/web/utils/digest/instrumentation.ts
- apps/web/__tests__/cron/digest.test.ts
- apps/web/__tests__/digest/idempotency.test.ts
- apps/web/prisma/schema.prisma
- apps/web/prisma/migrations/
- deploy/sql/2026-05-04-add-marketing-digest-action.sql
- deploy/sql/2026-05-04-backfill-218-digests.sql
- deploy/sql/README.md
- apps/web/utils/ai/digest/digest-schema.ts
- apps/web/utils/ai/digest/digest-prompt.ts
- apps/web/utils/ai/digest/generate-digest-content.ts
- apps/web/app/api/cron/digest/route.ts
- apps/web/utils/digest/run-daily-digest.ts
- apps/web/utils/digest/digest-send.ts
- packages/resend/src/send.tsx
- deploy/systemd/inbox-zero-digest.service
- deploy/systemd/inbox-zero-digest.timer
- deploy/systemd/README.md
