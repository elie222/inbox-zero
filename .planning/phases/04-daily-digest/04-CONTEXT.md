# Phase 4: Daily Digest - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Every morning at 9:00 AM Eastern, Rebekah receives a single email summarizing what landed in her inbox since the last successful digest. The digest is built around a Sonnet-generated conversational narrative on top, followed by per-item action sections (Urgent, Uncertain) and rolled-up auto-filed sections (Receipts, Newsletters, Marketing, Notifications) where Sonnet clusters items by sender or topic and writes a one-sentence summary per cluster. This phase delivers a reframed version of requirements DIGEST-01 through DIGEST-06; DIGEST-07 is descoped to Phase 6.

**Not in scope for Phase 4:**
- Rich feedback handling on Uncertain items (deferred to Phase 5 Rules UI / Phase 6 Feedback System — Phase 4 ships only a "Review in app →" deep-link per item).
- Restoring or replacing the deleted Deals rule (Deals appear as an emergent sub-cluster inside Marketing, surfaced by Sonnet roll-up; no separate rule).
- Real-time news integration in the narrative (Sonnet uses training-data knowledge of holidays/observances only; current-events references deferred unless plan-phase elects to wire a news API).
- Multi-tenant scheduling (single user; cron is hardcoded to 9am ET for rebekah@trueocean.com).

</domain>

<carry_forward>
## Carry-Forward Facts (from Phase 3 close-out)

- **Per-email summarize was removed** in Phase 3 (commit `102b3d89c`) when it was discovered the digest had never been sent. Batched-at-send-time summarization is the locked architectural direction. Phase 4 must fetch message bodies for every un-SENT DigestItem at digest-send time and pass them to Sonnet in a single batched call.
- **218 DigestItem rows accumulated since 2026-04-27** with empty content (the per-email summarize was removed before they could be filled). Decision in this phase: mark all 218 as SENT during deploy, do not attempt to send them. First real digest is forward-looking only.
- **The Deals rule was deleted during Phase 3 user curation.** REQUIREMENTS DIGEST-03 (Deals section) is reframed: promotional items appear as a Sonnet-clustered sub-row inside the Marketing rolled-up section, no separate top-level section, no new classification rule.
- **DigestItem creation gap (~12%)** observed in Phase 3 verification (anomaly A2 in `03-05-SUMMARY.md`): some DIGEST ExecutedActions exist without corresponding DigestItem rows. Plan-phase should investigate whether this is a Phase 3 bug to fix here or a separate issue.
- **Rule DIGEST actions** (locked in Phase 3 D-09/D-05): Urgent + Uncertain rules have DIGEST action; Receipts has DIGEST + ARCHIVE; Newsletters has DIGEST + ARCHIVE; Marketing has ARCHIVE (no DIGEST per Phase 3, but Phase 4 needs Marketing in the digest — plan-phase must add DIGEST action to the Marketing rule, or accept that Marketing in the digest comes from a different routing path).
- **No `/api/cron/digest` endpoint exists yet.** `apps/web/app/api/cron/` currently has only `automation-jobs` and `scheduled-actions`. Phase 4 creates the digest cron route.
- **Existing send-digest endpoint** at `apps/web/app/api/resend/digest/route.ts` is upstream code that pre-dates the redesigned digest. Plan-phase will decide rewrite-in-place vs. new endpoint.
- **Existing email template** at `packages/resend/emails/digest.tsx` is the upstream list-only design and stays as a reference. The redesigned template `packages/resend/emails/digest-v2.tsx` was built during this discuss-phase and is the visual contract for plan-phase.

</carry_forward>

<decisions>
## Implementation Decisions

### Section Structure & Narrative

- **D-01: Daily-briefing-first.** The digest is calm-morning-read shaped, not action-queue shaped. Top of the email is a Sonnet-written conversational paragraph; sections follow in narrative-implied order (Urgent → Uncertain → auto-filed cool-down).
- **D-02: Personal-assistant voice.** Conversational, lightly summarized, names the one or two things that caught Sonnet's eye. Not a neutral recap; not a coach giving orders; not a pattern-spotter analyst.
- **D-03: Voice has personality.** The narrative + auto-filed roll-ups should feel natural and fun: humor, light sarcasm, holiday/observance references where they fit (`Today is {date}` in the prompt so Sonnet can pull from training-data knowledge). Real-time news deferred — Sonnet's training cutoff means it can't know yesterday's events without an external API.
- **D-04: Tone guardrails.** Urgent items render in professional, informational tone — no jokes (legal/financial threads don't accept humor). Auto-filed and Uncertain can be playful. **Hard guardrail:** Sonnet must drop humor entirely if any item touches grief, serious illness, financial distress, legal threats, or family emergencies. Tone-deaf jokes about a death-in-family email would be catastrophic. Plan-phase: encode this in the system prompt.
- **D-05: Per-item Urgent and Uncertain.** Each Urgent and Uncertain item renders as its own card with full subject + sender + Sonnet-written summary. No roll-up.
- **D-06: Auto-filed sections roll up by sender or topic.** Sonnet clusters DigestItems within each auto-filed section (Receipts, Newsletters, Marketing, Notifications) along two axes: same-sender ("Starbucks reloaded twice for $40") and cross-sender topic ("Fuel: gas 3× at Wawa, BP, Shell totaling $120"). One cluster row per cluster, not per item. The cluster row's summary is Sonnet-generated, NOT the email subject line (subjects are misleading for receipts/newsletters/marketing).
- **D-07: Subject line is "Sonnet noun, Sonnet verb".** Each row in an auto-filed cluster reads `<bold cluster label>: <one-sentence summary>`. Cluster label is the noun ("Starbucks", "Fuel", "Tech & politics"), summary is the action/observation.
- **D-08: Section ordering is fixed.** Narrative → Urgent → Uncertain → Auto-filed (Receipts → Newsletters → Marketing → Notifications). Order is by warm-to-cool color hierarchy (red → amber → green → blue → purple → pink), reinforcing the implicit priority ranking. NOT by data-key order (the upstream `digest.tsx` rendered by object-key, which is wrong for our use case).
- **D-09: Visual contract is `digest-v2.tsx`.** The TypeScript React Email component at `packages/resend/emails/digest-v2.tsx` is the locked visual template. Static fixture data in `PreviewProps` matches the design mockup at `.planning/phases/04-daily-digest/design-reference/digest-mockup.html`. Plan-phase wires real DigestItem data into this component's props. The original upstream `packages/resend/emails/digest.tsx` is left untouched as a reference; final filename decision (replace vs. keep both) is a plan-phase concern.

### Uncertain Item UX

- **D-10: Single "Review in app →" link per Uncertain item.** No thumbs-up/thumbs-down feedback in the email. Reasoning: thumbs-up/down requires a known classification to confirm/reject, but Uncertain by definition means the classifier didn't pick one — the buttons would be semantically meaningless. Defer rich feedback to Phase 5 (Rules UI deep-link) and Phase 6 (Feedback System).
- **D-11: Review URL pattern.** `https://inbox.tdfurn.com/uncertain/{itemId}` — actual route lands in Phase 5. Phase 4 generates the link with the right itemId; the route itself is allowed to 404 in production until Phase 5 ships, since Phase 4 is single-user and Rebekah will know the limitation.

### Cron Timing

- **D-12: 9:00 AM Eastern, year-round.** Cron expression in `America/New_York` so DST shifts are handled by the scheduler, not the digest code. Single-tenant; not parameterized.
- **D-13: Window = since-last-successful-send, no cap.** Today's digest covers every un-SENT DigestItem regardless of how many days have elapsed. If the digest was missed yesterday (server down, etc.), today's digest covers ~48h. No cap on backlog size — a long outage produces a fatter digest rather than silently dropping items.
- **D-14: Idempotency policy.** Per-DigestItem `SENT` flag (already in schema as `Digest`/`DigestItem` status) plus a per-day `DigestSend` record keyed by date (UTC date OR ET date — plan-phase decides which is more robust around midnight). When cron fires:
  1. Query for items where `status != SENT`.
  2. If any found, transition them to `SENDING` (transactional).
  3. Send the email.
  4. On success, transition to `SENT` and create today's `DigestSend` record.
  5. On failure, transition back to `PENDING` for retry.
  6. If a second cron fires on the same date AND today's `DigestSend` record exists, skip immediately.
- **D-15: Subject line.** `Daily digest · {Day, Month D}` (e.g. `Daily digest · Monday, May 4`). No emoji, no urgency cues — body conveys priority. Sender name `Inbox Zero <inbox-digest@tdfurn.com>` (matches `RESEND_FROM_EMAIL` already in SSM).

### Backfill (218 Pre-Existing DigestItems)

- **D-16: Mark all 218 as SENT during deploy.** Single SQL statement run via Prisma seed script or a one-shot deploy hook: `UPDATE DigestItem SET status = 'SENT' WHERE status != 'SENT' AND createdAt < <deploy-timestamp>`. The 218 emails were already routed and filed correctly in Gmail during Phase 3; the digest would have been informational only, and with empty content there's nothing of value to recover. Rows stay in DB as audit trail; first real digest is forward-only.
- **D-17: Cutover acknowledgment.** No "we skipped 218 emails" email is sent. The transition is silent. The first real digest contains whatever arrived after deploy.

### Deals Reframing (DIGEST-03)

- **D-18: Deals = Marketing sub-cluster, not top-level section.** Sonnet's roll-up prompt for the Marketing section instructs it to identify promotional items (% off, $ off, sale, limited-time, discount) and group them into clusters labeled "Deals — outdoor", "Deals — software", etc. No new classification rule. No separate top-level section. The `digest-v2.tsx` mockup demonstrates this with two Marketing rows both prefixed `Deals —`.
- **D-19: REQUIREMENTS DIGEST-03 reframing.** Plan-phase must rewrite DIGEST-03 from "Digest contains Deals section with items worth flagging (based on user rules/thresholds)" to "Promotional items in the Marketing section appear as a Sonnet-detected sub-cluster prefixed 'Deals — {topic}', with no separate top-level section or classification rule."

### Spec Follow-Ups for plan-phase

- **REQUIREMENTS.md DIGEST-01:** Rewrite "between 6-7am" → "9:00 AM ET, since-last-send window".
- **REQUIREMENTS.md DIGEST-03:** Rewrite per D-19.
- **REQUIREMENTS.md DIGEST-05:** Rewrite "thumbs-up/thumbs-down feedback links per item" → "Review in app deep-link per item; rich feedback handling deferred to Phase 5/6".
- **REQUIREMENTS.md DIGEST-07:** Descope from Phase 4. Move to Phase 6 Feedback System.

</decisions>

<files_of_interest>
## Files of Interest for plan-phase

### New (Phase 4 visual contract)

- `packages/resend/emails/digest-v2.tsx` — locked visual template with typed props (`DigestV2Props`, `ActionItem`, `AutoFiledGroup`, `AutoFiledRow`) and static `PreviewProps`. Plan-phase wires real DigestItem data into these props.
- `packages/resend/scripts/render-digest-v2.ts` — render-to-static-HTML helper for visual review. Used during discuss-phase iteration.
- `packages/resend/scripts/send-digest-v2-test.ts` — one-shot Resend send helper for end-to-end verification. Used during discuss-phase iteration. Reads `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + `TEST_TO` from env.
- `.planning/phases/04-daily-digest/design-reference/` — Claude Design handoff bundle (README, original mockup HTML, design conversation transcripts). Treat the mockup HTML as the canonical visual spec.
- `.planning/phases/04-daily-digest/digest-v2-rendered.html` — last rendered output of `digest-v2.tsx` for diff/review.

### Existing (touch points for plan-phase)

- `packages/resend/emails/digest.tsx` — upstream list-only template. Reference; do not modify in Phase 4.
- `apps/web/app/api/resend/digest/route.ts` — current send-digest endpoint. Plan-phase decides rewrite-in-place vs. new route.
- `apps/web/app/api/resend/digest/queue/route.ts` — worker handoff. Likely needs rework.
- `apps/web/utils/ai/` — Sonnet narrative + cluster generation logic lives somewhere here in plan-phase.
- Prisma schema — `DigestSend` table likely needs creating; `DigestItem.status` enum likely needs `SENDING` state if not already present.
- AWS SSM — Phase 4 likely adds `DIGEST_CRON_TZ=America/New_York`, `DIGEST_TO=rebekah@trueocean.com` (or reuse `RESEND_FROM_EMAIL` parsing).

</files_of_interest>

<open_questions_for_planner>
## Open Questions for plan-phase (NOT user-facing)

These are engineering/integration questions that should be researched and answered during `/gsd-plan-phase 4`, not surfaced to the user as gray areas:

1. **What scheduler runs the cron?** BullMQ recurring job, Vercel cron (vercel.json), Upstash QStash, or system cron on EC2? Each has different timezone semantics. Inspect existing `/api/cron/automation-jobs` and `/api/cron/scheduled-actions` to see the pattern.
2. **Marketing rule DIGEST action.** Phase 3 D-05 has Marketing as LABEL + ARCHIVE only (no DIGEST). But Phase 4 needs Marketing in the digest (auto-filed roll-up). Plan-phase must either add DIGEST to the Marketing rule, route Marketing emails through a different DigestItem creation path, or update the Phase 4 query to include Marketing-labeled emails by label rather than via DIGEST action. Probably the first.
3. **DigestItem creation gap (anomaly A2).** ~12% of DIGEST ExecutedActions don't produce DigestItem rows. Plan-phase: investigate root cause and decide whether to fix in Phase 4 or punt.
4. **Sonnet cost projection.** Per-digest: one Sonnet call processing ~30-50 emails of context. Estimated ~10-30k input tokens, ~1-3k output tokens. ~$0.10-0.30/digest = ~$3-9/month. Acceptable per the $10/mo cost ceiling. Plan-phase to confirm token budget.
5. **DigestSend table schema.** Does it need columns beyond `(date, sentAt, messageId, status)`? Useful: token count for cost monitoring, item count, narrative text snapshot for replay/debugging.
6. **Failure visibility.** If the digest fails, how does Rebekah know? Options: (a) silent failure with logs, (b) fallback alert email, (c) Sentry/PagerDuty integration. Probably (a) for v1, with logs queryable.

</open_questions_for_planner>
