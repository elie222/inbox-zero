# Roadmap: Personal Email AI

## Shipped Milestones

- **v1.0** *(2026-04-27 → 2026-05-17, 21 days)* — Three-tier classification pipeline + 9am ET daily digest with Sonnet narrative + production deploy on EC2. 7 of 7 phases complete (4 built, 3 closed by recognizing the spec was already satisfied by upstream features or manual triage). See [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md) and [`milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md) for full detail.

## Current Milestone

No active milestone. Run `/gsd-new-milestone` to start the next one.

## Backlog (carries forward across milestones)

### Carried-Forward Deferred Items (from v1.0)

- **CLASS-09** — Gmail `CATEGORY_PROMOTIONS` clean-route to Marketing (added 2026-05-08, scope trimmed; pending)
- **FEEDBACK-06** — Inject accumulated feedback into classification prompt. Deferred unless accuracy degrades.
- **LEARN-01..03** — Pattern graduation to native Gmail filters; periodic prompt regeneration from feedback history
- **DEAL-01, DEAL-02** — Per-sender deal thresholds (e.g., Harbor Freight ≥20%, Home Depot power tools only)
- **MON-01, MON-02** — Classification stats dashboard + AI cost alerting

Promote any of these into the next milestone via `/gsd-new-milestone` or `/gsd-review-backlog`.
