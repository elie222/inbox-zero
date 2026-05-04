# 04-01 SUMMARY — Wave 0 prerequisites

## Delivered

| Task | Outcome | Commit |
|------|---------|--------|
| 1. Rewrite DIGEST-01/03/05; descope DIGEST-07 | REQUIREMENTS.md updated per CONTEXT.md §Spec Follow-Ups (9:00 AM ET, Marketing sub-cluster, Review-in-app deep-link); DIGEST-07 moved to Phase 6. | `debf6c582` |
| 2. Scaffold test harness | 5 test files, all `it.skip` placeholders. Compile + run cleanly. | `9118ab6b9` |
| 3. Instrument DIGEST enqueue path | `traceDigestEnqueue` helper + wired into `digest` ActionFunction in `apps/web/utils/ai/actions.ts`. | `772763f4f` |

## Files

- `.planning/REQUIREMENTS.md` — DIGEST checklist + traceability table updated
- `apps/web/__tests__/cron/digest.test.ts`
- `apps/web/__tests__/digest/idempotency.test.ts`
- `apps/web/__tests__/ai/digest-narrative.test.ts`
- `apps/web/__tests__/ai/digest-tone.test.ts`
- `packages/resend/__tests__/digest-v2.test.tsx`
- `apps/web/utils/digest/instrumentation.ts` (new)
- `apps/web/utils/ai/actions.ts` (digest action wrapped in `traceDigestEnqueue`)

## Verification

- All test scaffolds parse + skip cleanly via vitest (13 skipped, 0 failed reported by Plan 01 executor before checkpoint).
- Lint: pre-commit ultracite fix passed on each commit.
- Instrumentation logs three events per DIGEST execution: `digest.enqueue.start`, `digest.enqueue.success`, `digest.enqueue.failure`. Keyed by `executedActionId + emailAccountId + messageId`. `ruleName` left optional (not available at the action call site without a wider refactor).

## Deviations

- **Sandbox blocker.** Plan 01 executor agent committed task 1 then was denied `git commit` permission for tasks 2 + 3. Orchestrator finished tasks 2 + 3 inline. No scope changes.
- **`void` operator lint failure.** Initial test scaffold used `void DigestV2Email` to keep the import non-elidable; ultracite rejected it. Replaced with `const _DigestV2EmailRef = DigestV2Email`.

## Pending for downstream plans

- `digest-narrative.test.ts` and `digest-tone.test.ts` skip-bodies fill in during Plan 04.
- `cron/digest.test.ts`, `digest/idempotency.test.ts`, `digest-v2.test.tsx` skip-bodies fill in during Plan 05.
- Once instrumentation lands in production, expect a week of production logs to confirm whether the 12% gap is enqueue failures, QStash dropouts, or downstream `/api/ai/digest` errors.
