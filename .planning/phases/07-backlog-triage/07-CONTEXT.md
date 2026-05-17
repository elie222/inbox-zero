# Phase 7: Backlog Triage - Context

**Gathered:** 2026-05-17
**Status:** Closed without implementation — satisfied by manual triage

<domain>
## Phase Boundary

Process the 100k+ existing email backlog through the classification pipeline and let Rebekah approve or reject batch actions before anything changes in Gmail. Covers requirements BACKLOG-01 through BACKLOG-05.

</domain>

<outcome>
## Outcome — Manual Triage Already Solved It

Phase 7 was scoped when the backlog was the largest pain point. By the time the project reached Phase 7, the user had already worked through it using Gmail's native tools:

- Filtered All Mail by attachment size; purged the largest attachments
- Deleted everything in Gmail's auto-assigned "Promotions" category
- Deleted historic emails from the `greers@` mailing list
- Filtered to top senders and purged the biggest offenders
- Unsubscribed from and blocked the senders that no longer matter

Mailbox size and daily volume have both dropped substantially. The remaining mail is mid-priority/long-tail content that doesn't justify building classify-and-batch infrastructure — the cost of building it would exceed the value of triaging what's left.

The Phase 1-6 classification pipeline catches new mail going forward; Gmail's blunt-but-effective tools handled the backlog.

</outcome>

<decisions>
## Implementation Decisions

- **D-01: Phase 7 closed without code.** No `/backlog` UI, no Batch API integration, no approval gate, no Gmail batchModify worker. None of it shipped, because the problem it would have solved was already solved by hand.
- **D-02: Don't pre-emptively build the CLI/script alternative.** Even the minimal version (one-shot classify-and-label script) isn't justified. If a bulk-cleanup need emerges later, build then.
- **D-03: Pattern noted for future reference.** If the backlog problem ever returns (e.g., classification rules change significantly, or a new email account is connected with its own backlog), the right shape is: read All Mail in pages, submit Haiku Batch API jobs, write proposals to Postgres, approve via small CLI or `/rules`-style page, apply via `gmail.users.messages.batchModify` (1000 IDs/call) in a worker. No need to build it now.

</decisions>

<canonical_refs>
## Canonical References

- `apps/web/app/(app)/[emailAccountId]/clean/` — upstream "clean" tool that conceptually overlaps with Phase 7. If a future bulk-cleanup phase happens, decide then whether to fork this or build new.
- `apps/web/utils/ai/clean/ai-clean.ts` — upstream's per-email archive/keep AI call. Not three-tier-pipeline-aware.
- `.planning/phases/03-classification-engine/03-CONTEXT.md` — the live classification path that catches new mail going forward.

</canonical_refs>

<deferred>
## Deferred Ideas (potential Phase 999.x backlog)

- **Bulk-classify script for future use:** one-shot CLI that pages through All Mail, submits Haiku Batch API jobs, persists proposals, and applies labels via `batchModify` after CLI approval. Build only if a real bulk-cleanup need emerges.
- **Multi-account onboarding flow:** if a second Gmail account ever gets connected, that account's backlog would need triaging. The script above would be the path; not building it speculatively.
- **Periodic re-classify pass:** rerun classification on the last N days of mail after major rule changes. Currently unnecessary — the live pipeline picks up changes automatically.

</deferred>

---

*Phase: 7-backlog-triage*
*Closed: 2026-05-17 — satisfied by manual triage*
