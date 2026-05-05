# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27)

**Core value:** Inbox only shows things that need Rebekah — everything else is already filed before she opens Gmail.
**Current focus:** Phase 4 — Daily Digest

## Current Position

Phase: 4 of 7 (Daily Digest)
Plan: 6 of 6 plans code-complete; 2 operator checkpoints remain (Plan 03 Task 2 prod SQL + Plan 06 Task 2 EC2 systemd install)
Status: Phase 4 code shipped 2026-05-04. All 6 plans authored, committed, typecheck clean across project. Plans 03 Task 2 (prod DB SQL execution) and 06 Task 2 (systemd timer install on EC2) await a single deploy session — both run after the next image deploy lands Plan 02 migration + Plan 04/05 code.
Last activity: 2026-05-04 — Phase 4 execute: Plans 01/02/03-T1/04/05/06-T1 committed inline as orchestrator (sandbox blocked subagents from running git commit + prisma CLI); REQUIREMENTS.md updated; DigestSend model + migration; Sonnet batched generator; cron orchestrator + /api/cron/digest GET+POST; tests rewritten (compile clean, run blocked in this PowerShell session by case-mismatch bug); deploy/sql + deploy/systemd authored.

Progress: [████░░░░░░] 43% (3 of 7 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 45min
- Total execution time: 45min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02-inbox-zero-recon | 1 | 45min | 45min |

**Recent Trend:**
- Last 5 plans: 02-01 (45min)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Three-tier AI (rules → Haiku → Sonnet) keeps AI cost under $10/mo
- Recon phase gates all feature work — no building on Inbox Zero until internals are mapped
- Single-tenant design: no multi-user abstractions
- Existing infra (EC2, Postgres, Docker) is kept as-is
- Webhook entry point KEEP — token verification, rate-limit guard, after() deferral are production-ready
- match-rules.ts KEEP + EXTEND — GroupItem learned pattern matching is already free Tier 1; needs explicit priority ordering
- ai-choose-rule.ts REPLACE model selection, KEEP prompt structure — replace default model with economy (Haiku) + Sonnet escalation
- DIGEST action KEEP + EXTEND — opt-in per rule; Phase 3 must attach DIGEST Action rows to all 8 classification rules
- No confidenceScore column in ExecutedRule — Phase 3 must add `confidenceScore Float?` via Prisma migration
- ECONOMY_LLM_* env vars unset in production — all economy tasks fall back to Sonnet (primary cost problem for Phase 3 to fix)
- Current cost estimate ~$7.26/month (all Sonnet); proposed three-tier estimate ~$1.88/month (74% savings)

### Pending Todos

None yet.

### Blockers/Concerns

- Anthropic key is prepaid credits — monitor balance at console.anthropic.com before Phase 3 deployment
- 10 rules exist in production — Phase 3 must inspect names before deciding replace vs. merge strategy
- ECONOMY_LLM_PROVIDER confirmed unset in SSM — Phase 3 must set before deploying tiered classification *(RESOLVED 2026-04-27: all 4 ECONOMY/NANO vars set to claude-haiku-4-5-20251001)*
- Conversation tracking double-billing *(RESOLVED 2026-05-01: TO_REPLY/AWAITING_REPLY/FYI/ACTIONED system rules disabled in DB. Were triggering a second Sonnet call on every person-email. Cost was $0.016/email → now ~$0.004/email)*
- Haiku model name staleness: claude-haiku-4-5-20251001 will eventually be deprecated; SSM params must be updated manually when that happens (no automated detection in place)
- Cost still at ceiling (~$10/month at 85 emails/day, Haiku-only). Prompt caching would save ~30-50% on system prompt tokens if emails cluster in bursts; low-priority for Phase 4.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-04
Stopped at: Phase 4 code complete. Two operator checkpoints remain — both run together in the next deploy session:
  1. **Push to main** triggers GitHub Actions image build, then on EC2: `docker compose pull app && docker compose up -d app` (this applies the DigestSend Prisma migration via `prisma migrate deploy`).
  2. **Run Plan 03 Task 2 SQL** against prod Postgres: Marketing DIGEST seed + 218-row backfill (cutoff timestamp must be updated to actual UTC time first). See `deploy/sql/README.md`.
  3. **Install Plan 06 systemd units** on EC2: copy to /etc/systemd/system, daemon-reload, smoke-test the service unit, verify email arrives + DigestSend row, re-run for idempotency check, then enable the timer. See `deploy/systemd/README.md`.
  4. **Day-2 async**: confirm next-morning auto-fired digest arrives without manual trigger; update `.planning/phases/04-daily-digest/04-06-SUMMARY.md` with the proof.
Resume file: None
