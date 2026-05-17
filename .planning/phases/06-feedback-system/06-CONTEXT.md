# Phase 6: Feedback System - Context

**Gathered:** 2026-05-17
**Status:** Mostly satisfied by upstream + real-world accuracy; minimal code change required

<domain>
## Phase Boundary

Classification improves over time via thumbs-up/down clicks, narrative corrections, and Gmail behavioral signals. Covers requirements FEEDBACK-01 through FEEDBACK-06.

</domain>

<reframing>
## Reframing — Real-World Accuracy Changes the Math

Phase 6 was scoped assuming feedback would be frequent enough to drive learning. After ~13 days of organic operation post-Phase 4 deploy, accuracy has been high enough that the user has not exercised the existing "Wrong label?" link once. Combined with discoveries about upstream features:

- **FEEDBACK-01** (thumbs in email): **Dropped.** No need for binary voting when corrections are rare. The original "Wrong label?" link in `digest-v2.tsx` is the only feedback affordance and is repointed (see D-01).
- **FEEDBACK-02** (narrative feedback form link in digest): **Reinterpreted.** The repointed `/rules` link serves the same purpose — when something misclassifies, the user edits the rule that should have caught it. The upstream `/ai/chat` UI provides the freeform narrative-correction surface for cases requiring more nuance.
- **FEEDBACK-03** (narrative form accepts free-text + associates with digest): **Satisfied by upstream `/ai/chat`** — already supports free-text rule editing conversations with full context.
- **FEEDBACK-04** (Gmail relabel detection): **Satisfied by upstream.** `apps/web/app/api/google/webhook/process-history.ts:419` already subscribes to `labelAdded` and `labelRemoved` history types via the existing webhook. Trusted, not verified end-to-end — if accuracy regresses later, verify then.
- **FEEDBACK-05** (Gmail delete detection): **Satisfied by upstream** via the same `messageDeleted` history channel.
- **FEEDBACK-06** (feedback injected into classification prompt): **Deferred.** Accuracy doesn't need help. Revisit only if/when classification quality degrades. Pre-emptive token spend on every classify call isn't justified.

</reframing>

<decisions>
## Implementation Decisions

- **D-01: Revert fork-only feedback additions toward upstream, not repoint.** Original plan was to repoint the "Wrong label?" links to /rules. Revised: delete the fork's feedback page, endpoint, and digest wiring entirely so future upstream merges are easier. The user can choose to edit a rule in /rules OR relabel directly in Gmail — both work, neither needs in-fork plumbing.
- **D-02: No new schema.** No `ClassificationFeedback` table, no new columns on `ExecutedRule`. Upstream already records Gmail history events; we are not adding additional persistence at this time.
- **D-03: No prompt injection of feedback.** FEEDBACK-06 stays deferred. The classification prompt does not include "lessons learned" or "recent corrections" — keeps token cost stable and avoids speculative complexity.
- **D-04: No verification of upstream Gmail-signal persistence.** User accepted upstream behavior as-is. If a future regression makes FEEDBACK-04/05 load-bearing, read `process-history.ts` then to confirm corrections actually persist to the DB rather than just trigger re-classification.
- **D-05: Phase 4 carry-forward resolved.** Phase 4 D-10 ("Single 'Review in app →' link, no thumbs") is no longer reversed. Thumbs stay out of the email permanently.

</decisions>

<scope>
## Actual Phase 6 Work — Revert Fork Additions

Goal: drop the fork's never-exercised feedback plumbing so future merges from elie222/inbox-zero stay clean. Three commits' worth of additions to undo:

**Fork commits introducing this:**
- `259f5975f` — `feat: add /feedback page and POST /api/user/rule-feedback endpoint`
- `18d53fef7` — `feat: wire feedbackUrl into digest email template and send pipeline`
- `d34b558b7` — `fix: ... dark-mode feedback page ...` (touches the feedback page)

**Files to delete:**
- `apps/web/app/(app)/feedback/page.tsx`
- `apps/web/app/(app)/feedback/FeedbackForm.tsx`
- `apps/web/app/api/user/rule-feedback/` (entire directory — POST endpoint)

**Files to revert toward upstream (selective edits, not full revert — the digest cron and digest-v2.tsx contain other Phase 4 work to preserve):**
- `packages/resend/emails/digest-v2.tsx`:
  - Line 23: drop `feedbackUrl?: string;` from per-item type
  - Line 37: drop `feedbackUrl?: string;` from per-group type
  - Line 104: simplify condition back to `variant === "uncertain" && item.reviewUrl ?`
  - Lines 114-121: delete the per-item `feedbackUrl` Link block
  - Lines 154-163: delete the per-group `feedbackUrl` Link block
  - Optional: scrub `reviewUrl: "https://inbox.tdfurn.com/uncertain/..."` fixtures at lines 333, 340 and the test at `packages/resend/__tests__/digest-v2.test.tsx:22` since `/uncertain/{id}` was never built and won't be (Phase 4 D-11 is now permanent)
- `apps/web/utils/digest/run-daily-digest.ts`:
  - Lines 274-290: delete `buildFeedbackUrl` helper
  - Line 307: remove `feedbackUrl: buildFeedbackUrl(src),` from per-item payload
  - Line 325: remove `feedbackUrl: firstItem ? buildFeedbackUrl(firstItem) : undefined,` from per-group payload
  - Drop the `isEligibleForClassificationFeedback` import — check that helper is unused elsewhere and delete it too if so
  - Drop `reviewBase` / `reviewUrl` lines if no other code consumes them after the above edits

**Tests:** drop or update any tests referencing `feedbackUrl`, the `/feedback` route, the `/api/user/rule-feedback` endpoint, or `buildFeedbackUrl`.

**Verification before commit:**
- `pnpm test -- packages/resend` runs clean
- Local `pnpm test -- apps/web/utils/digest` runs clean
- `grep -rn "feedbackUrl\|/feedback\|rule-feedback" apps/web packages/resend` returns nothing (or only upstream-owned matches)

**Out of scope for this revert:** the `/uncertain/{itemId}` deep-link is fork-introduced via `reviewUrl` but Phase 4 deliberately left the page unbuilt (D-11). Suggest scrubbing those too in this revert pass so the digest doesn't carry dead URLs. If user prefers to keep `reviewUrl` for future use, leave it.

</scope>

<canonical_refs>
## Canonical References

- `packages/resend/emails/digest-v2.tsx` (lines 104-123, 154-163) — The two "wrong label?" links to repoint
- `apps/web/app/api/google/webhook/process-history.ts` (line 419) — Upstream `labelAdded`/`labelRemoved`/`messageDeleted` subscription (FEEDBACK-04/05 surface, trusted not verified)
- `apps/web/app/(app)/[emailAccountId]/assistant/` — Upstream `/ai/chat` UI satisfying FEEDBACK-03 narrative feedback
- `.planning/phases/04-daily-digest/04-CONTEXT.md` D-10/D-11 — Phase 4's "Review in app" deferral; now resolved as "stays deferred, thumbs never go in email"

</canonical_refs>

<deferred>
## Deferred Ideas

- FEEDBACK-06 prompt injection — only if classification quality degrades. Then: Sonnet-summarized "lessons learned" refreshed nightly, capped at N tokens, prepended to the classification system prompt.
- Verification of upstream Gmail signal persistence — only when feedback signal becomes load-bearing.
- Dedicated `ClassificationFeedback` table — only if/when we need to correlate thumbs/relabels/deletes with specific ExecutedRule records for analytics.

</deferred>

---

*Phase: 6-feedback-system*
*Context gathered: 2026-05-17*
