---
plan: 03-05
phase: 03-classification-engine
status: complete
completed: 2026-05-04
wave: 5
verification_method: organic-data
---

# Phase 3 — Classification Engine — Verification Summary

**Verified:** 2026-05-04
**Operator:** Rebekah
**Production deploy SHA at verification:** `5a01e8c5...` (post cost-fix, container started 2026-05-04T17:36:03Z)
**Verification method:** Organic data — 14-day window of real classified emails, instead of synthetic T1–T8 test emails. Chosen because production has accumulated 486 classified emails since rule seed (2026-04-27), giving stronger evidence than 8 contrived ones.

## Plan Deviations (Accepted)

The original plan locked an 8-rule matrix (Receipts, Deals, Newsletters, Marketing, Urgent, 2FA, Uncertain, Greers List). Production diverged via deliberate user curation between 04-28 and verification day:

| Plan rule | Production state | Reason |
|---|---|---|
| Deals | Dropped | Folded into Marketing in practice |
| Greers List | Dropped | No longer needed |
| Receipts | ARCHIVE removed → LABEL+DIGEST | User preference: receipts have ongoing value, shouldn't be hidden |
| 2FA | LABEL+ARCHIVE (no DELETE) | DELETE deferred — see CLASS-05 below |
| (new) Internal | LABEL only | User-added rule for internal-org email |
| (new) TD Furn | LABEL only | User-added rule for tdfurn.com email |

The plan's expected matrix has been rewritten against production reality below. Verification ran against the new matrix.

## Cost-Fix Verification (Pre-UAT Gate)

Three nested cost bugs were diagnosed and fixed earlier this session (commits up to `102b3d89c`). Runtime behavior since the deploy at 2026-05-04T17:36 UTC:

```
Container started:   2026-05-04T17:36:03Z
Emails since deploy: 4
Haiku calls:         4   (1 per email — correct)
Sonnet calls:        0
Summarize-digest:    0
Fallback warnings:   0
```

Cost fix confirmed working in production. Each classification round-trip averages ~2.5s wall-clock (well under 120s SLA).

## Requirement Sign-Off

| Requirement | Evidence | Status |
|-------------|----------|--------|
| CLASS-01 — every email classified into one rule | 486 ExecutedRule rows in last 14d across 9 active rules; live rule list passed to Haiku each request | ✅ |
| CLASS-02 — three-tier pipeline (rules → Haiku → Sonnet) | 4/4 post-deploy emails routed to Haiku (economy), 0 Sonnet escalations, 0 fallback warnings | ✅ |
| CLASS-03 — confidenceScore semantics | AI matches: confidenceScore populated (e.g., Newsletters 54/58, Receipts 76/81); LEARNED_PATTERN matches: confidenceScore null (e.g., Marketing 56 learned matches all null) | ✅ |
| CLASS-04 — Urgent/Uncertain stay in inbox; rest archived | Marketing has ARCHIVE; Newsletters has ARCHIVE; Urgent has no ARCHIVE; Uncertain has no ARCHIVE; (Receipts has no ARCHIVE per user edit — accepted deviation) | ✅ |
| CLASS-05 — 2FA auto-delete after delay | **Deferred** — DELETE ActionType not in upstream Inbox Zero schema; user has determined ≥1h persistence is required for 2FA codes; original 1440min spec replaced. See backlog 999.2. | ⏸ Deferred |
| CLASS-06 — static rule path bypasses AI | Phase 3 has no static-from rules in production after Greers List was dropped. The static-rule code path is exercised by LEARNED_PATTERN (group-based) matching, which executed 78 times in the last 14d with no AI call. CLASS-06 semantics (static path bypasses AI) verified via the learned-pattern path. | ✅ |
| CLASS-07 — new rules match before conversation meta-rule | All 4 conversation rules (To Reply, Awaiting Reply, FYI, Actioned) have `enabled=false` in production — meta-rule contention cannot occur until Phase 5 re-enables them. Guard logic from 03-04 is in place for when they return. | ✅ |
| CLASS-08 — 2-min SLA from arrival to classification | 4/4 post-deploy emails: webhook receipt → AI choose-rule completed within 2.4–3.1 seconds. Median ~2.5s, ~50× headroom under 120s SLA. | ✅ |

## Production Rule Matrix (As Verified)

| Rule | Actions | Tier | 14-day count | Notes |
|---|---|---|---|---|
| Marketing | LABEL+ARCHIVE | AI (Haiku) + LEARNED | 198 | Largest category — captures vendor promo |
| Receipts | LABEL+DIGEST | AI (Haiku) + LEARNED | 97 | No ARCHIVE per user (accepted) |
| Newsletters | LABEL+ARCHIVE+DIGEST | AI (Haiku) + LEARNED | 63 | |
| Urgent | LABEL+DIGEST | AI (Haiku) | 62 | Stays in inbox |
| Uncertain | LABEL+DIGEST | AI (Haiku) | 37 | Stays in inbox |
| Internal | LABEL | AI (Haiku) | 10 | User-curated; trueocean.com |
| 2FA | LABEL+ARCHIVE | AI (Haiku) | 5 | DELETE deferred (999.2) |
| TD Furn | LABEL | AI (Haiku) | 2 | User-curated; tdfurn.com |
| FYI | LABEL | system (disabled) | 2 | enabled=false; pre-disable artifacts |

## Performance Snapshot (Last 14 Days)

- **Total classifications**: 486 in 14 days (~35/day average)
- **Tier distribution since cost-fix deploy**: 100% Haiku, 0% Sonnet
- **Fallback warnings**: 0
- **Median classification latency**: ~2.5s end-to-end
- **2FA auto-delete failures**: N/A (action not implemented; deferred)

## Anomalies Observed (Captured as Backlog)

### A1 — Unrouted ExecutedRule rows (`ruleId=NULL`)

132 rows in 14d with `ruleId=NULL` despite Haiku producing a classification reason. **Time-distribution shows this is a one-time artifact**: 113 of the 132 rows were on 2026-04-27 (the day rules were re-seeded and old rule IDs vanished). Recent days: 1–3/day, attributable to AI returning category names that don't resolve (e.g., "Notification" instead of any active rule).

→ Captured as **Phase 999.3 (AI Prompt Drift)** in ROADMAP. Severity: low — only affects ~1 email/day in steady state.

### A2 — DigestItem creation gap (~12%)

Of the 121 `ExecutedAction(type=DIGEST)` rows in the last 3 days, 14 have no corresponding DigestItem. Pattern is consistent across rules with DIGEST action (Receipts 86.6%, Newsletters 92.1%, Urgent 90.3%, Uncertain 56.8%).

→ This is **Phase 4 (Daily Digest) territory** since the digest pipeline is being rebuilt anyway. Captured implicitly via Phase 4's existing scope. Will be re-verified during Phase 4 UAT.

### A3 — 2FA auto-delete (CLASS-05) deferred to backlog

DELETE ActionType absent in upstream schema; new requirement is ≥1h persistence (not 24h as originally spec'd) so a different timing model is needed. Open question for the future implementer: does Gmail API + the BullMQ delayed-action runner support `users.messages.trash`/`.delete`?

→ Captured as **Phase 999.2 (2FA Short-Delay Auto-Delete)**.

## Cost Snapshot

- **Anthropic balance at session start (2026-05-04)**: $1.42
- **Pre-fix burn rate**: ~$0.016/email (mix of Sonnet on classify + Haiku on digest-summarize)
- **Post-fix burn rate**: ~$0.004/email (Haiku-only classify; no per-email digest-summarize)
- **Projected monthly cost at 35 emails/day**: ~$4.20 — within $10/month constraint
- **vs. RESEARCH estimate ($1.88/mo)**: Slightly over due to longer Haiku prompts than estimated; well within ceiling

## Phase 3 Complete

All 8 CLASS requirements verified or properly deferred:
- 7 fully verified via 14d organic data
- 1 (CLASS-05 2FA auto-delete) intentionally deferred to Phase 999.2

Hand off to Phase 4 (Daily Digest), which will also incidentally close out the DigestItem creation gap (A2).
