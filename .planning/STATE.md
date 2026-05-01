# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27)

**Core value:** Inbox only shows things that need Rebekah — everything else is already filed before she opens Gmail.
**Current focus:** Phase 3 — Classification Engine

## Current Position

Phase: 3 of 7 (Classification Engine)
Plan: 4 of 5 in current phase
Status: Executing Phase 3 — Wave 4 complete, Wave 5 ready
Last activity: 2026-04-28 — 03-04 complete: two-call escalation, confidenceScore threading, meta-rule guard deployed; migration applied to production

Progress: [██░░░░░░░░] 28% (2 of 7 phases complete)

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

Last session: 2026-04-27
Stopped at: Phase 2 fully verified — RECON.md finalized with all three open questions answered. Ready for Phase 3 planning.
Resume file: None
