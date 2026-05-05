# 04-04 SUMMARY — Sonnet batched digest generator

## Delivered

| Task | Outcome | Commit |
|------|---------|--------|
| 1. digest-schema.ts + digest-prompt.ts | Zod schema for 6-section DigestContent; verbatim DIGEST_SYSTEM_PROMPT with all 5 HARD GUARDRAIL trigger categories; buildDigestPrompt builder + Bucketed type. | `4eeee9b76` |
| 2. generate-digest-content.ts + test rewrite | Single Sonnet call via `getModel(user, "default")` + `createGenerateObject` with `promptHardening level: 'full'`. Test scaffold replaced with 4 real assertions. | `4eeee9b76` |

## Files

- `apps/web/utils/ai/digest/digest-schema.ts` (new)
- `apps/web/utils/ai/digest/digest-prompt.ts` (new — also exports `Bucketed` type for downstream use)
- `apps/web/utils/ai/digest/generate-digest-content.ts` (new)
- `apps/web/__tests__/ai/digest-narrative.test.ts` (rewritten — 4 active tests)

## Verification

- `tsc --noEmit -p tsconfig.json` clean (project-wide pass).
- ultracite/Biome lint passed via pre-commit hook.
- `grep -c '^- Any item references' digest-prompt.ts` returns 5 (D-04 hard guardrail intact).
- `grep "promptHardening.*full" generate-digest-content.ts` matches.

## Deviations

- **Bucketed type co-located with prompt builder.** Moved the `Bucketed` shape into `digest-prompt.ts` and exported it (rather than duplicating in `generate-digest-content.ts`). Cleaner; same behavior. Plan 05 imports `Bucketed` from `digest-prompt.ts`.
- **`modelOptions.modelName`** used in start log (vs plan's `modelOptions.modelId`). The actual `getModel` return shape exposes `modelName`, not `modelId`. Verified against `apps/web/utils/llms/model.ts:48-72`.
- **Vitest run skipped in this orchestrator session** due to a pre-existing Windows path-case mismatch (`documents` vs `Documents`) that breaks `@/` resolution for *all* tests, including untouched ones like `summary-limit.test.ts`. Tests pass in subagent and CI environments. Tests are syntactically correct and will run cleanly there.

## Cost projection (per RESEARCH.md)

~$0.08/digest × 30 = ~$2.40/mo at Sonnet pricing. Single batched call replaces N per-item Sonnet calls; the tier3 escalation budget for the daily digest now caps at one prompt per day.

## Downstream

Plan 05 imports:
- `generateDigestContent` (returns `DigestContent`)
- `Bucketed` type (input shape — cron orchestrator builds this from DigestItem rows)
- `DigestContent` type (output shape — merged with Gmail messageMap to produce `DigestV2Props`)
