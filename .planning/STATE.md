# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17)

**Core value:** Inbox only shows things that need Rebekah — everything else is already filed before she opens Gmail.
**Current focus:** v1.1 Calendar-Aware Email — defining requirements.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-17 — Milestone v1.1 started

Progress: v1.1 [          ] 0% (0 of N phases)

## Performance Metrics

**Velocity:**
- Total plans completed (v1.0): 1 tracked
- Average duration: 45min
- Total execution time: 45min

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Carry-forward from v1.0:

- Three-tier AI (rules → Haiku → Sonnet) keeps AI cost under $10/mo
- Single-tenant design: no multi-user abstractions
- Existing infra (EC2, Postgres, Docker) is kept as-is
- Cost still at ceiling (~$10/month at 85 emails/day, Haiku-only) — calendar context must ride Haiku tier

v1.1-specific decisions:

- Auto-create events from emails: always auto-create, user deletes if wrong (Gmail-style)
- Google Calendar OAuth already connected for rebekah@trueocean.com — no Phase 0 connect step needed

### Pending Todos

- **Audit `/etc/cron.d/inbox-zero` endpoints (2026-05-09):** verify whether `/api/cron/automation-jobs`, `/api/cron/scheduled-actions`, and `/api/watch/all` are actually needed in this self-hosted fork. If unused, delete the cron file rather than maintain dead schedulers.

### Blockers/Concerns

- Anthropic key is prepaid credits — monitor balance at console.anthropic.com
- Haiku model name staleness: `claude-haiku-4-5-20251001` will eventually be deprecated; SSM params must be updated manually when that happens
- Cost at ceiling (~$10/mo). Adding calendar context to classification prompt risks pushing over — must measure token impact in Phase 1

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-17
Stopped at: v1.1 started — requirements being defined. Next: write REQUIREMENTS.md + ROADMAP.md, then `/gsd-plan-phase 8`.
Resume file: None
