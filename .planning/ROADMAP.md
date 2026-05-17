# Roadmap: Personal Email AI

## Shipped Milestones

- **v1.0** *(2026-04-27 → 2026-05-17, 21 days)* — Three-tier classification pipeline + 9am ET daily digest with Sonnet narrative + production deploy on EC2. 7 of 7 phases complete (4 built, 3 closed by recognizing the spec was already satisfied by upstream features or manual triage). See [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md) and [`milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md) for full detail.

## Current Milestone

No active milestone. Run `/gsd-new-milestone` to start the next one.

## Backlog (carries forward across milestones)

### Phase 999.1: Sender/Domain Whitelist UI

**Goal:** A dedicated settings page to manage "always deliver to inbox" senders and domains. Matching emails bypass all rule classification and land in the inbox untouched.

**Notes:**
- Should support full addresses (`user@domain.com`) and domain wildcards (`@domain.com`)
- Backend: new `SenderWhitelist` model (emailAccountId, pattern, type: EMAIL|DOMAIN, label?)
- Short-circuit check at top of `findPotentialMatchingRules()` before any rule evaluation
- Existing workaround: static Rules with `from` filter + LABEL action (no ARCHIVE) — currently serving this purpose for `@trueocean.com` and `@tdfurn.com`

### Phase 999.2: 2FA Short-Delay Auto-Delete

**Goal:** Auto-delete 2FA / OTP emails after a short delay (~1 hour) so they don't clutter the inbox or Trash long-term, while remaining accessible during the verification window.

**Notes:**
- Originally captured under CLASS-05 in v1.0 Phase 3. Implementation deferred — current 2FA rule is LABEL+ARCHIVE only.
- 1440min (24h) was the original spec; reduce to ~60min — 2FA codes are typically used within minutes, but persistence ≥1h covers delayed login or backup-code use
- Blocker observed in v1.0 Phase 3: `DELETE` ActionType not present in upstream Inbox Zero schema (per 03-03-SUMMARY)
- Open question: does Gmail API expose delete? `users.messages.trash` and `users.messages.delete` exist in the API; needs verification that the OAuth scope and BullMQ delayed-action runner support either
- Implementation likely needs: new `DELETE` ActionType in Prisma schema; runner support for the delete operation; rule edit to swap ARCHIVE→DELETE+60min on the 2FA rule

### Phase 999.3: AI Prompt Drift — Unrouted ExecutedRule Rows

**Goal:** Fix AI classifier producing categories that no longer have a corresponding `Rule` row, leading to `ExecutedRule` rows with `ruleId=NULL` and no actions firing — emails sit in the inbox unrouted.

**Notes:**
- Observed during v1.0 Phase 3 verification (2026-05-04): 132 ExecutedRule rows in the last 14d had `ruleId=NULL`
- Two flavors: (1) LEARNED_PATTERN matches against `Group` rows whose linked `Rule` has been deleted; (2) AI-tier matches whose reason text refers to category names like "Receipt", "Notification", "Deals" that no longer have rules in the DB
- Likely root cause: the rule list passed to Haiku is stale — either hardcoded category names in the prompt, or built from a snapshot rather than the live `Rule` table
- Fix direction: regenerate the rule list given to Haiku from `SELECT * FROM Rule WHERE enabled=true` at request time; on a NULL match, fall through to `Uncertain` rather than recording an actionless ExecutedRule
- Cost impact: low — these rows still consumed Haiku tokens, so no $ leak, but they represent emails that didn't get the user's intended treatment

### Carried-Forward Deferred Items (from v1.0)

- **CLASS-09** — Gmail `CATEGORY_PROMOTIONS` clean-route to Marketing (added 2026-05-08, scope trimmed; pending)
- **FEEDBACK-06** — Inject accumulated feedback into classification prompt. Deferred unless accuracy degrades.
- **LEARN-01..03** — Pattern graduation to native Gmail filters; periodic prompt regeneration from feedback history
- **DEAL-01, DEAL-02** — Per-sender deal thresholds (e.g., Harbor Freight ≥20%, Home Depot power tools only)
- **MON-01, MON-02** — Classification stats dashboard + AI cost alerting

Promote any of these into the next milestone via `/gsd-new-milestone` or `/gsd-review-backlog`.
