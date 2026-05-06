# Personal Email AI — inbox.tdfurn.com

## What This Is

A single-tenant AI email management system built on a self-hosted fork of Inbox Zero, running on AWS EC2. It automatically sorts every incoming email into one of 8 categories using a three-tier processing pipeline (rules → Haiku → Claude Sonnet), keeps only urgent and uncertain items in the Gmail inbox, and delivers a 6-7am daily digest. The system learns from feedback and gets better at understanding what Rebekah actually needs over time.

## Core Value

On a normal Tuesday morning, Rebekah opens her inbox and only sees things that need her — everything else is already filed. A digest email told her what mattered before she even opened Gmail.

## Requirements

### Validated

- ✓ EC2 server running with nginx, SSL, Docker — existing infra
- ✓ Postgres database with all migrations applied — existing infra
- ✓ Google OAuth authentication for rebekah@trueocean.com — existing infra
- ✓ Gmail API connection via PubSub (real-time email events) — existing infra
- ✓ Anthropic API connected (claude-sonnet-4-6) — existing infra
- ✓ Resend API connected (tdfurn.com verified domain) — existing infra
- ✓ Nightly Postgres backups to S3 — existing infra
- ✓ Gmail watch auto-renew cron — existing infra

### Active

- [ ] Every incoming email is automatically classified into one of 8 categories
- [ ] Urgent + Uncertain emails stay in inbox; everything else is labeled and archived
- [ ] 6-7am daily digest delivered to rebekah@trueocean.com with actionable summary
- [ ] In-email feedback (thumbs up/down) on uncertain classifications
- [ ] Narrative feedback form for detailed corrections
- [ ] Gmail behavioral signals (deletes, relabels) captured as feedback
- [ ] Simple rules management page at inbox.tdfurn.com/rules
- [ ] 100k backlog triage with AI-proposed batch actions and human approval
- [ ] Classification improves from accumulated feedback over time
- [ ] Digest from address fixed (currently broken — sends from wrong domain)
- [ ] Signups locked to rebekah@trueocean.com only
- [ ] GitHub Actions CI/CD for ghcr.io/rebekah-create/inbox-zero-rebekah

### Out of Scope

- Multi-user support — single-tenant personal system by design
- Mobile app or push notifications — email digest is sufficient
- Automatic graduation to native Gmail filters — v2, needs confidence data first
- Local Redis — using Upstash, not worth the complexity to switch
- Real-time chat or collaboration — not an email problem
- Any AI processing that can't fit within $10/mo additional cost

## Context

**Platform:** Self-hosted fork of elie222/inbox-zero at github.com/rebekah-create/inbox-zero-rebekah. The fork is a Next.js 15 app with Postgres, Upstash Redis, and its own AI/rules engine. The infrastructure stack is solid and will be kept. The app layer (Inbox Zero's classification logic, rules engine, digest system) needs to be audited before deciding what to keep vs. replace — this is Phase 2.

**The problem:** 100k emails in inbox, 30k+ unread. Daily firehose of receipts, newsletters, deals, marketing, 2FA codes, tenant communications, Step Up scholarship emails, etc. "Block this sender" is too blunt — needs nuanced, feedback-driven learning.

**Email categories:** Receipts, Deals, Newsletters, Marketing, Urgent, 2FA, Uncertain, Greers List

**Greers List context:** greers@trueocean.com is a Google Group shared with husband. Those emails get their own label and skip inbox.

**Urgent signals (examples):** Step Up for Students scholarship holds, tenant issues, IRS notices, "response required," deadline language. Claude learns more from feedback over time.

**AI cost constraint:** Total AI spend must stay within current Claude subscription + max $10/mo additional. This drives the three-tier architecture.

**Inbox Zero recon needed:** Rebekah hasn't had time to learn the existing app deeply and doesn't want to invest time in "their way" if it turns out to be a burden. Phase 2 produces a keep/replace/extend decision for each major component before building anything on top.

## Constraints

- **Cost**: AI processing must cost ≤$10/mo additional — drives three-tier architecture (rules free → Haiku cheap → Sonnet sparingly)
- **Single tenant**: Built only for rebekah@trueocean.com — no multi-user abstractions needed
- **EC2 t4g.small**: ARM64, 2GB RAM — no memory-hungry local AI models
- **Upstream fork**: Fork of elie222/inbox-zero — custom changes should be minimally invasive to allow future upstream merges
- **Tech stack**: Next.js 15, TypeScript, Postgres, Docker Compose — additions must fit this stack
- **Gmail API rate limits**: Batch operations must be rate-limited to avoid quota exhaustion

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three-tier AI: rules → Haiku → Sonnet | Keep AI cost under $10/mo while maintaining quality | — Pending |
| Recon phase before building | Don't invest in Inbox Zero's app layer until we know what it actually does | — Pending |
| Single-tenant design | Only one user — avoid multi-tenant complexity | — Pending |
| Keep existing infra stack | EC2, Postgres, Docker all working — don't touch what works | — Pending |
| Planning files in inbox-zero-rebekah repo | Planning agents need to read the code | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-27 after initialization*
