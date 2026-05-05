# 04-05 SUMMARY — Daily digest cron orchestration

## Delivered

| Task | Outcome | Commit |
|------|---------|--------|
| 1. today-et.ts + digest-send.ts + sendDigestV2Email | UTC-midnight ET Date helper, idempotency lookup, transactional create-args builder, Resend wrapper for digest-v2.tsx. | `70afc0106` |
| 2. run-daily-digest.ts (orchestrator) | End-to-end pipeline: idempotency → state machine → Gmail batch fetch → bucket → Sonnet → prop merge → send → atomic SENT commit. | `70afc0106` |
| 3. /api/cron/digest route + replaced test stubs | GET (Bearer) + POST (body secret) handlers; 9 active tests across cron auth, idempotency, and digest-v2 prop-driven render. | `6386f4a1f` |

## Files

- `apps/web/utils/digest/today-et.ts` (new) — `getTodayET()`, `formatTodayHumanET()`
- `apps/web/utils/digest/digest-send.ts` (new) — `digestAlreadySentToday`, `buildDigestSendCreate`
- `apps/web/utils/digest/run-daily-digest.ts` (new) — full orchestrator
- `apps/web/app/api/cron/digest/route.ts` (new) — GET + POST cron handlers
- `packages/resend/src/send.tsx` — added `sendDigestV2Email` (also exported via barrel `packages/resend/src/index.ts`)
- `apps/web/__tests__/cron/digest.test.ts` (rewritten — 2 tests)
- `apps/web/__tests__/digest/idempotency.test.ts` (rewritten — 2 tests)
- `packages/resend/__tests__/digest-v2.test.tsx` (rewritten — 4 tests)

## Pipeline shape

```
GET /api/cron/digest
  → withError + hasCronSecret(Bearer)
  → runDailyDigest(logger)
      for each EmailAccount with PENDING|FAILED digests:
        ├─ digestAlreadySentToday → skip if already sent
        ├─ refresh_token check → skip if missing
        ├─ findMany pendingDigests (PENDING|FAILED, items + rule name)
        ├─ updateMany → PROCESSING
        ├─ try:
        │   ├─ createEmailProvider + getMessagesBatch (100/batch, 2s pace)
        │   ├─ bucket items by Phase-3 rule name → 6 buckets
        │   ├─ generateDigestContent (Sonnet, single call)
        │   ├─ merge Sonnet output with messageMap → DigestV2Props
        │   ├─ sendDigestV2Email (Resend → digest-v2.tsx render)
        │   └─ $transaction:
        │       ├─ Digest updateMany → SENT + sentAt
        │       ├─ DigestItem updateMany → content '[REDACTED]'
        │       └─ DigestSend.create (audit + idempotency anchor)
        └─ catch: Digest updateMany → FAILED (self-healing on next cron)
```

## Verification

- `tsc --noEmit -p tsconfig.json` clean across the full project (0 errors).
- ultracite/Biome lint passed on every commit (pre-commit hook).
- Tests written but not run in this orchestrator session (Windows `documents`/`Documents` path-case mismatch breaks `@/` resolution for vitest in this PowerShell environment — pre-existing, affects all `@/`-importing tests including `summary-limit.test.ts`). Tests will run in CI / dev container.

## Deviations

- **Self-healing pendingDigests query.** Plan suggested making the query include `status: { in: [PENDING, FAILED] }` for v1 — implemented. Failed sends roll forward into the next morning's run.
- **`emailAccount` shape passed to `generateDigestContent`.** Plan example used `account as any` — replaced with an explicit `EmailAccountWithAI` projection (no `as any`) so the type is enforced.
- **Subject line.** Used `Daily digest · {todayHuman}` (D-15).
- **Review URL base.** Reads `env.NEXT_PUBLIC_BASE_URL` with `https://inbox.tdfurn.com` fallback. Falls back to RESEND_FROM_EMAIL only when env is unset (handled identically by `sendDigestV2Email`).
- **`scoped.warn` for missing message in messageMap** — extra defensive log per RESEARCH.md; fires when Gmail returns fewer messages than requested IDs (typical when an item is permanently deleted between classification and the next morning).

## Cost guardrail

Plan calls `generateDigestContent` exactly once per EmailAccount per day. Sonnet input ≈ 50 emails × ~700 tokens = ~35K tokens × $0.003/1K = ~$0.105 input + ~$0.05 output = ~$0.15/digest worst-case (above the RESEARCH.md projection of $0.08; still ~$4.50/mo at 30 days, well under the $10/mo Phase 4 cap).

## Downstream (Plan 06)

- systemd timer fires `curl -H "Authorization: Bearer $CRON_SECRET" https://inbox.tdfurn.com/api/cron/digest` at 09:00 America/New_York daily.
- First cron MUST fire only AFTER Plan 03 Task 2 prod SQL is applied (Marketing DIGEST seed + 218-row backfill).

## Pending

- Plan 03 Task 2 (production SQL execution) — operator checkpoint.
- Plan 06 (systemd timer install on EC2) — operator checkpoint.
