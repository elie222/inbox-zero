# Phase 4: Daily Digest — Discussion Log

**Discussed:** 2026-05-04 (across two sessions, paused once mid-flow)
**Outcome:** All four gray areas resolved → see `04-CONTEXT.md` for locked decisions.

---

## Session structure

Phase 4 was framed around four gray areas drafted from carry-forward facts surfaced during Phase 3 close-out:

1. Section structure & narrative role
2. Cron timing & timezone
3. Backfill of 218 accumulated DigestItems
4. DIGEST-03 Deals reframing

Discussion proceeded sequentially through #1 → #4, with mid-flow tooling work (Claude Design integration + React Email component) inside gray area #1 to lock the visual contract empirically rather than in prose.

---

## Gray Area #1 — Section structure & narrative

### Q1: What's the primary job of the digest?

**Options:** Triage queue first / Daily briefing first / Hybrid / List-only no narrative.
**Answer:** Daily briefing first.
**Rationale:** Calm morning read; situational awareness over action queue; Sonnet narrative is the centerpiece.

### Q2: What's the voice and content of the narrative?

**Options:** Pattern-spotter (analytical) / Personal assistant (conversational) / Neutral recap (just facts) / Action-oriented coach.
**Answer:** Personal assistant — conversational, lightly summarized, names the one or two things that caught the eye.

### Q3: How detailed are the auto-filed sections?

**Options:** Counts + sender names / Counts + sender names + subjects / Full per-item content / Counts only.
**Answer (with elaboration):** Sender names + Sonnet-generated rolled-up summaries — explicitly NOT subject lines (subjects are misleading for receipts/newsletters/marketing). Cluster by sender ("Starbucks reloaded twice for $40") AND by topic ("Fuel: gas 3× at Wawa, BP, Shell totaling $120 — road trip?"). Rolled-up summaries are the differentiator from upstream's per-item rendering.

### Q4: Do Urgent and Uncertain get the same roll-up treatment?

**Options:** Per-item full detail / Same roll-up as auto-filed / Hybrid (roll up only on 3+ from same thread).
**Answer:** Per-item, full detail. Action items need to be seen individually; rolling up obscures what action is required.

### Q5: Template file decision

**Initial options:** Modify `digest.tsx` in place / new bespoke template / inline subcomponents wrapper.
**User redirected:** Asked to see what the existing template renders like before deciding. Then asked for a Claude Design prompt to produce a high-fidelity mockup.

### Mid-flow tooling work

Claude Design produced a static HTML mockup demonstrating the locked decisions from Q1-Q4. User invoked the design via `https://api.anthropic.com/v1/design/h/FD3seP1FixJHWj53kibNiw`. Design was saved as `.planning/phases/04-daily-digest/design-reference/digest-mockup.html` and the chat transcripts preserved alongside.

A React Email TypeScript component `packages/resend/emails/digest-v2.tsx` was built to match the mockup pixel-for-pixel using `<Tailwind>` + `@react-email/components`, keeping the upstream `digest.tsx` untouched as a reference. PreviewProps populated with the design's exact sample copy.

User opted not to install a local React Email preview server (heavyweight; bundled pnpm install was burning CPU). Switched to a leaner approach: a render-to-static-HTML script (`scripts/render-digest-v2.ts`) plus a one-shot Resend send script (`scripts/send-digest-v2-test.ts`) that pulls API credentials from AWS SSM at runtime and sends a real test email to rebekah@trueocean.com. This let the user evaluate the design in their actual Gmail client (desktop + mobile) rather than a fake preview.

### Bug fixes during iteration

- **Touch target spacing on Uncertain feedback pills.** Two pills sat shoulder-to-shoulder on mobile, easy mis-tap. User also identified a deeper semantic issue:
- **Semantic problem with Uncertain thumbs.** "Looks right / Wrong category" makes no sense on Uncertain items because no category was assigned to confirm or reject. User selected a different resolution: drop thumbs entirely, replace with a single "Review in app →" deep-link per item. Solves both the touch-target problem and the semantic gap. Rich feedback deferred to Phase 5/6.
- **Border bug in auto-filed cluster rows.** Tailwind `border-t` without paired `border-0` caused all four sides to render at default `medium` (3px) width — Fuel and Amazon rows showed visible 4-side borders inside the Receipts card while Starbucks (no border classes) didn't. Fixed by pairing `border-t` with `border-0`. Saved as a project memory for future React Email work.

### User feedback that shaped the voice further

User added: "I have a good sense of humor and would like the summaries to feel natural and conversational... humor, sarcasm, current events, relevant holidays, weird fact of the day — to make it interesting and fun to read."

Updated PreviewProps to demonstrate the voice in action:
- Narrative now opens with "Happy National Donut Day, allegedly. (It's a real thing. The internet wouldn't lie.)"
- Auto-filed roll-ups have personality: "the spirit is caffeinated, the wallet is concerned" / "every SaaS scheduled their renewal pitch for the same week"
- Urgent items deliberately stay professional (no jokes about Joe's pricing thread)

Hard guardrail captured for plan-phase: drop humor entirely if any item touches grief, serious illness, financial distress, legal threats, or family emergencies. Saved as a project memory.

### Final voice spec (D-01 through D-04)

See `04-CONTEXT.md`.

---

## Gray Area #2 — Cron timing & timezone

### Q1: Exact send time + timezone

**Options:** 6:00 / 6:30 / 7:00 ET / Custom.
**Answer:** Custom — **9:00 AM Eastern**.

This is outside the original DIGEST-01 spec ("between 6-7am") — REQUIREMENTS rewrite captured as plan-phase follow-up.

### Q2: Window + missed-run policy

**Options:** Since last send (no cap) / Since last send (48h cap) / Rolling 24h / Multi-email split.
**Answer:** Since last successful send, no cap.
**Rationale:** Items marked SENT after delivery; multi-day outage produces a fatter catch-up digest rather than dropping anything.

### Engineering defaults locked without further questions

- **DST:** Cron expression in `America/New_York` so DST shifts handled automatically.
- **Idempotency:** Per-DigestItem `SENT` flag + per-day `DigestSend` record.
- **Subject line:** `Daily digest · {Day, Month D}`.

---

## Gray Area #3 — Backfill of 218 accumulated DigestItems

### Q1: What to do with the 218 empty-content rows from 2026-04-27 onward?

**Options:** Mark all SENT (skip) / Hard-delete / Backfill via Sonnet then send / One-line acknowledgment then mark SENT.
**Answer:** Mark all 218 as SENT during deploy; first real digest is forward-only.
**Rationale:** Emails were already routed and filed correctly in Gmail during Phase 3; with empty content there's nothing of value to recover. Audit trail preserved (rows stay in DB).

---

## Gray Area #4 — DIGEST-03 Deals reframing

### Q1: Fate of the Deals section, given the Deals rule was deleted in Phase 3 user curation?

**Options:** Descope entirely / Marketing sub-cluster / Restore Deals rule / Defer to backlog.
**Answer:** Marketing sub-cluster, surfaced via Sonnet roll-up.
**Rationale:** Honors the Phase 3 curation decision (no separate Deals rule), still surfaces promotional items as a distinct cluster within Marketing. No new classification cost. The `digest-v2.tsx` mockup demonstrates the result with two Marketing rows prefixed `Deals —`.

REQUIREMENTS DIGEST-03 rewrite captured as plan-phase follow-up.

---

## Notable side decisions (not gray areas, but locked here)

- **Resend, not SES.** User initially asked about SES for the test email; clarified this fork uses Resend (per CLAUDE.md and `RESEND_FROM_EMAIL` already in SSM).
- **Local AWS profile (`cli-admin`) has SSM read access.** Used to pull `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for one-shot test email sends without writing secrets to disk.
- **MSYS path-translation gotcha.** Bash on this Windows machine mangles `/inbox-zero/...` SSM parameter names; PowerShell works correctly. Saved for future shell-tool selection.
- **The `cc-inbox-zero` sibling folder was deleted** (stale scratch dir from late April; only contained a duplicate `load-secrets.sh`). The other sibling `inbox-zero/` is the infra repo (terraform state for the EC2 deployment) and was kept.
- **Three test emails were sent during iteration:** Resend message IDs `d7b14e7c-c31b-45ab-83df-c64f71cc4f48` (initial), `45b966d4-cea5-4250-8f17-b973da719ccb` (post Uncertain UX fix), `ec2160e9-a9e7-49d3-b796-a0930c7101a0` (post border bug fix), `494209e7-9859-435b-9137-720e1e56814d` (final, with personality voice).
