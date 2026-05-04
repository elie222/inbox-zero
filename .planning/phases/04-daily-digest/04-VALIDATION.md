---
phase: 4
slug: daily-digest
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `04-RESEARCH.md § Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (existing in apps/web; see `pnpm test`) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm test -- <path>` (single file/grep) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30s (excludes AI tests) |

AI-touching tests gated behind `RUN_AI_TESTS=true` (see `pnpm test-ai`). They run on demand, not as part of the per-task sampling loop, to avoid LLM cost during development.

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <closest test file>`
- **After every plan wave:** Run `pnpm test` (excluding AI tests)
- **Before `/gsd-verify-work`:** Full suite green + one live render of `digest-v2.tsx` against fixture data
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled in by planner. Stubs for the must-haves:

| Must-Have | Plan (TBD) | Test Type | Verification Command |
|-----------|-----------|-----------|----------------------|
| Cron fires at 9:00 AM ET | TBD | manual + log assertion | systemd `journalctl -u inbox-zero-digest.timer` OR scheduler log |
| Digest sends successfully | TBD | integration | `pnpm tsx packages/resend/scripts/send-digest-v2-test.ts` |
| Idempotency holds across double-fires | TBD | integration | Hit `/api/cron/digest` twice; assert one Resend call, second returns "already-sent" |
| Sonnet stays within token budget | TBD | unit | Mock 50-item input; assert prompt token count ≤ 35K (per research §Cost) |
| Tone guardrail triggers on grief/legal/distress fixtures | TBD | AI test | `pnpm test-ai -- digest-tone.test.ts` with 5 fixture emails per category |
| Backfill SQL marks exactly 218 Digest rows SENT | TBD | one-shot SQL + assertion | `SELECT COUNT(*) FROM "Digest" WHERE status = 'SENT' AND createdAt < '<deploy-ts>'` |
| `digest-v2.tsx` renders with real DigestItem data | TBD | snapshot | `pnpm tsx packages/resend/scripts/render-digest-v2.ts --real` |
| Marketing items appear in digest | TBD | integration | After Marketing rule has DIGEST action, send a marketing email through the pipeline; assert DigestItem row + render row |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/__tests__/cron/digest.test.ts` — stubs for DIGEST-01 (cron auth + window query)
- [ ] `apps/web/__tests__/digest/idempotency.test.ts` — stubs for D-14 transitions
- [ ] `apps/web/__tests__/ai/digest-narrative.test.ts` — stubs for Sonnet batched-call shape (mocked)
- [ ] `packages/resend/__tests__/digest-v2.test.tsx` — stubs for prop-driven rendering
- [ ] `apps/web/__tests__/ai/digest-tone.test.ts` — AI-gated fixtures for grief/legal/distress guardrail (only runs under `RUN_AI_TESTS=true`)

*Existing vitest infrastructure covers everything except AI fixtures, which are added under Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual review of rendered digest | DIGEST-02, D-09 | React Email renderings need human eye on hierarchy/color | Run `packages/resend/scripts/render-digest-v2.ts`, open `digest-v2-rendered.html` in browser, confirm matches `design-reference/digest-mockup.html` |
| First real digest delivery | DIGEST-01 | Production cron in real timezone is hard to fake | After deploy, wait until 9:00 AM ET next morning; confirm email arrives in rebekah@trueocean.com |
| Tone guardrail edge cases | D-04 | LLM judgment on whether humor was appropriately suppressed | Manually inspect 3 digests over first week for any tone-deaf jokes near sensitive content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags in test commands
- [ ] Feedback latency < 30s for quick tests
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills task map

**Approval:** pending
