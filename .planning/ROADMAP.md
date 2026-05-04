# Roadmap: Personal Email AI

## Overview

Seven phases take this project from a partially broken Inbox Zero fork to a fully operational, single-tenant AI email system. Phase 1 fixes operational blockers independent of all other work. Phase 2 audits the fork before anything is built on top of it. Phases 3-7 build the classification engine, daily digest, rules UI, feedback system, and backlog triage in dependency order — each delivering a complete, verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Ops Fixes** - Fix broken digest sender, lock signups, wire up CI/CD pipeline *(completed 2026-04-27)*
- [x] **Phase 2: Inbox Zero Recon** - Audit fork internals and produce keep/replace/extend decisions *(completed 2026-04-27)*
- [x] **Phase 3: Classification Engine** - Three-tier pipeline classifying every incoming email *(completed 2026-05-04 — CLASS-05 deferred to Phase 999.2)*
- [ ] **Phase 4: Daily Digest** - 6-7am email summarizing urgent items, deals, auto-filed counts, and uncertain items
- [ ] **Phase 5: Rules Management UI** - Simple page at inbox.tdfurn.com/rules for explicit classification instructions
- [ ] **Phase 6: Feedback System** - In-email signals, narrative form, and Gmail behavioral feedback feeding classification
- [ ] **Phase 7: Backlog Triage** - AI-assisted processing of 100k+ existing emails with batch proposals and human approval

## Phase Details

### Phase 1: Ops Fixes
**Goal**: The server infrastructure is fully operational and locked down for single-tenant use
**Depends on**: Nothing (first phase)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):
  1. Digest email arrives in inbox from inbox-digest@tdfurn.com (not a wrong domain)
  2. Attempting to create a second account is blocked — only rebekah@trueocean.com can sign in
  3. Pushing to main on GitHub triggers a Docker image build and push to ghcr.io/rebekah-create/inbox-zero-rebekah without manual steps
  4. The production server is running Rebekah's fork image, not the upstream elie222 image
**Plans**: 3 plans in 2 waves

**Wave 1:**
- [x] 01-PLAN-01.md — Update docker-compose.yml to fork image and deploy to server (OPS-04)
- [x] 01-PLAN-02.md — Upgrade CI/CD workflow to multi-platform with SHA tags (OPS-03)

**Wave 2** *(blocked on Wave 1 completion)*:
- [x] 01-PLAN-03.md — Set SSM env vars for signup lockdown and digest from-address, verify end-to-end (OPS-01, OPS-02)

**Cross-cutting constraints:**
- All plans verify requirements end-to-end, not just confirm code presence (D-06)

### Phase 2: Inbox Zero Recon
**Goal**: Every major component of the Inbox Zero fork is mapped with a documented keep/replace/extend decision before any new code is written on top of it
**Depends on**: Phase 1
**Requirements**: RECON-01, RECON-02, RECON-03, RECON-04, RECON-05, RECON-06
**Success Criteria** (what must be TRUE):
  1. Classification pipeline is documented — inputs, outputs, existing prompts, confidence scoring behavior
  2. Rules engine is documented — how rules are stored, evaluated, and applied to incoming email
  3. AI integration is documented — which models are called, at which endpoints, with what prompts
  4. Database schema is documented for all tables relevant to classification and digests
  5. Each major component has a written keep/replace/extend decision with rationale
  6. Projected cost of current Inbox Zero AI usage vs. proposed three-tier architecture is calculated
**Plans**: 1 plan in 1 wave

**Wave 1:**
- [x] 02-PLAN-01.md — Write RECON.md covering all six RECON requirements (RECON-01 through RECON-06)

### Phase 3: Classification Engine
**Goal**: Every incoming email is automatically classified into one of 8 categories within 2 minutes of arrival, using a cost-respecting three-tier pipeline
**Depends on**: Phase 2
**Requirements**: CLASS-01, CLASS-02, CLASS-03, CLASS-04, CLASS-05, CLASS-06, CLASS-07, CLASS-08
**Success Criteria** (what must be TRUE):
  1. A new email arriving via PubSub is classified into exactly one of: Receipts, Deals, Newsletters, Marketing, Urgent, 2FA, Uncertain, Greers List — within 2 minutes
  2. Urgent and Uncertain emails remain in the Gmail inbox; all others are labeled and archived
  3. Each classification result is stored in Postgres with a confidence score
  4. 2FA/OTP emails are auto-deleted after 24 hours
  5. Emails from greers@trueocean.com are labeled "Greers List" and archived without touching the inbox
  6. Explicit rules from the Rules UI are applied as the highest-priority tier before Haiku or Sonnet are called
**Plans**: 5 plans in 5 waves

**Wave 1:**
- [x] 03-01-PLAN.md — Wave 0 pre-flight: SSM env vars, Anthropic credit balance, Haiku model name verification (CLASS-02, CLASS-08) *(completed 2026-04-27)*

**Wave 2** *(blocked on Wave 1)*:
- [x] 03-02-PLAN.md — Prisma migration: add ExecutedRule.confidenceScore + ai-choose-rule.test.ts RED stubs (CLASS-02, CLASS-03) *(completed 2026-04-27)*

**Wave 3** *(blocked on Wave 2)*:
- [x] 03-03-PLAN.md — Seed 8 canonical rules in production DB; delete 6 old content rules (CLASS-01, CLASS-04, CLASS-05, CLASS-06, CLASS-07) *(completed 2026-04-27)*

**Wave 4** *(blocked on Waves 2 + 3)*:
- [x] 03-04-PLAN.md — Two-call escalation, confidenceScore threading, conversation meta-rule guard, deploy (CLASS-01..CLASS-08) *(completed 2026-04-28)*

**Wave 5** *(blocked on Wave 4)*:
- [ ] 03-05-PLAN.md — End-to-end production verification of all 8 CLASS requirements (all CLASS)

**Cross-cutting constraints:**
- `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true` must be set in SSM before any DIGEST actions are seeded or fired (03-01, 03-03)
- All LLM calls must use `createGenerateObject()` with `promptHardening: { trust: "untrusted", level: "full" }` — never raw `generateObject()` (03-04)
- Prisma migration (`confidenceScore Float?`) must be deployed before any code writes to `ExecutedRule.confidenceScore` (03-02 before 03-04)

**UI hint**: yes

### Phase 4: Daily Digest
**Goal**: Every morning between 6-7am, Rebekah receives one email that tells her what needs attention and what was auto-filed overnight
**Depends on**: Phase 3
**Requirements**: DIGEST-01, DIGEST-02, DIGEST-03, DIGEST-04, DIGEST-05, DIGEST-06, DIGEST-07
**Success Criteria** (what must be TRUE):
  1. A digest email arrives in rebekah@trueocean.com between 6:00am and 7:00am daily
  2. The digest lists Urgent items with sender, subject, and a one-line summary
  3. The digest lists noteworthy Deals based on active rules and thresholds
  4. The digest shows auto-filed counts by category (e.g., "14 newsletters, 6 receipts filed")
  5. The digest lists Uncertain items with thumbs-up/thumbs-down links that record feedback without requiring login
  6. The digest narrative is generated by Claude Sonnet once per day
**Plans**: TBD
**UI hint**: yes

### Phase 5: Rules Management UI
**Goal**: Rebekah can write, edit, and delete explicit classification rules in plain language from a simple web page — no code changes needed
**Depends on**: Phase 3
**Requirements**: RULES-01, RULES-02, RULES-03, RULES-04, RULES-05, RULES-06
**Success Criteria** (what must be TRUE):
  1. A page exists at inbox.tdfurn.com/rules and is accessible without login
  2. Rebekah can type a plain-language rule (e.g., "emails from xyz about abc → Urgent") and save it
  3. Rebekah can create sender-only rules to filter by origin rather than content
  4. Existing rules can be edited or deleted from the same page
  5. Active rules are automatically included in the classification prompt for the next incoming email
**Plans**: TBD
**UI hint**: yes

### Phase 6: Feedback System
**Goal**: Classification improves over time by capturing thumbs-up/down clicks, narrative corrections, and Gmail behavioral signals — all fed back into the classification prompt
**Depends on**: Phase 4
**Requirements**: FEEDBACK-01, FEEDBACK-02, FEEDBACK-03, FEEDBACK-04, FEEDBACK-05, FEEDBACK-06
**Success Criteria** (what must be TRUE):
  1. Clicking thumbs-up or thumbs-down on an Uncertain item in the digest records the feedback in Postgres tied to that email's classification
  2. The digest contains a link to a narrative feedback form where Rebekah can describe corrections in free text
  3. Relabeling an email in Gmail is detected and stored as a classification correction signal
  4. Deleting an auto-filed email in Gmail is detected and stored as a negative classification signal
  5. Accumulated feedback is incorporated into the classification prompt so future similar emails are classified better
**Plans**: TBD
**UI hint**: yes

### Phase 7: Backlog Triage
**Goal**: The 100k+ email backlog is processed through the classification pipeline and Rebekah can approve or reject batch actions before anything is changed in Gmail
**Depends on**: Phase 3
**Requirements**: BACKLOG-01, BACKLOG-02, BACKLOG-03, BACKLOG-04, BACKLOG-05
**Success Criteria** (what must be TRUE):
  1. The full email backlog can be run through the three-tier classification pipeline without exceeding Gmail API quotas or the $10/mo AI cost ceiling
  2. Processing produces grouped batch proposals (delete, label, archive) organized by category and sender
  3. Rebekah can review batch proposals and approve or reject each group before any Gmail action is taken
  4. Backlog processing uses the Haiku Batch API to keep one-time cost within the ~$10-15 estimate
**Plans**: TBD

## Backlog

### Phase 999.1: Sender/Domain Whitelist UI (BACKLOG)

**Goal:** A dedicated settings page to manage "always deliver to inbox" senders and domains. Matching emails bypass all rule classification and land in the inbox untouched.
**Requirements:** TBD
**Plans:** 0 plans

**Notes:**
- Should support full addresses (`user@domain.com`) and domain wildcards (`@domain.com`)
- Backend: new `SenderWhitelist` model (emailAccountId, pattern, type: EMAIL|DOMAIN, label?)
- Short-circuit check at top of `findPotentialMatchingRules()` before any rule evaluation
- Existing workaround: static Rules with `from` filter + LABEL action (no ARCHIVE) — currently serving this purpose for `@trueocean.com` and `@tdfurn.com`

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: 2FA Short-Delay Auto-Delete (BACKLOG)

**Goal:** Auto-delete 2FA / OTP emails after a short delay (~1 hour) so they don't clutter the inbox or Trash long-term, while remaining accessible during the verification window.

**Requirements:** Originally captured under CLASS-05 in Phase 3. Implementation deferred — current 2FA rule is LABEL+ARCHIVE only.

**Plans:** 0 plans

**Notes:**
- 1440min (24h) was the original spec; reduce to ~60min — 2FA codes are typically used within minutes, but persistence ≥1h covers delayed login or backup-code use
- Blocker observed in Phase 3: `DELETE` ActionType not present in upstream Inbox Zero schema (per 03-03-SUMMARY)
- Open question: does Gmail API expose delete? `users.messages.trash` and `users.messages.delete` exist in the API; needs verification that the OAuth scope and BullMQ delayed-action runner support either
- Implementation likely needs: new `DELETE` ActionType in Prisma schema; runner support for the delete operation; rule edit to swap ARCHIVE→DELETE+60min on the 2FA rule

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: AI Prompt Drift — Unrouted ExecutedRule Rows (BACKLOG)

**Goal:** Fix AI classifier producing categories that no longer have a corresponding `Rule` row, leading to `ExecutedRule` rows with `ruleId=NULL` and no actions firing — emails sit in the inbox unrouted.

**Requirements:** TBD — relates to CLASS-01 (every email gets exactly one rule match).

**Plans:** 0 plans

**Notes:**
- Observed during Phase 3 verification (2026-05-04): 132 ExecutedRule rows in the last 14d had `ruleId=NULL`
- Two flavors: (1) LEARNED_PATTERN matches against `Group` rows whose linked `Rule` has been deleted; (2) AI-tier matches whose reason text refers to category names like "Receipt", "Notification", "Deals" that no longer have rules in the DB
- Likely root cause: the rule list passed to Haiku is stale — either hardcoded category names in the prompt, or built from a snapshot rather than the live `Rule` table
- Fix direction: regenerate the rule list given to Haiku from `SELECT * FROM Rule WHERE enabled=true` at request time; on a NULL match, fall through to `Uncertain` rather than recording an actionless ExecutedRule
- Cost impact: low — these rows still consumed Haiku tokens, so no $ leak, but they represent emails that didn't get the user's intended treatment

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Ops Fixes | 3/3 | Complete | 2026-04-27 |
| 2. Inbox Zero Recon | 1/1 | Complete | 2026-04-27 |
| 3. Classification Engine | 5/5 | Complete | 2026-05-04 |
| 4. Daily Digest | 0/TBD | Not started | - |
| 5. Rules Management UI | 0/TBD | Not started | - |
| 6. Feedback System | 0/TBD | Not started | - |
| 7. Backlog Triage | 0/TBD | Not started | - |
