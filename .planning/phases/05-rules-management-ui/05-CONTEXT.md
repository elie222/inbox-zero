# Phase 5: Rules Management UI - Context

**Gathered:** 2026-05-17
**Status:** Closed without implementation — satisfied by upstream features

<domain>
## Phase Boundary

Rebekah can write, edit, and delete explicit classification rules in plain language from a web page — no code changes needed. Covers requirements RULES-01 through RULES-06.

</domain>

<outcome>
## Outcome — No Work Required

Phase 5 was scoped before we had mapped what Inbox Zero already ships. The upstream codebase already provides a full rules management UI that satisfies every Phase 5 success criterion:

| Success Criterion | Satisfied By |
|---|---|
| 1. Page exists at /rules | `apps/web/app/(app)/rules/page.tsx` already redirects to `/[emailAccountId]/automation?tab=rules` |
| 2. Plain-language rule entry | Upstream `RuleForm.tsx` has an `instructions` textarea that flows directly into `Rule.instructions` (the field `getUserRulesPrompt` serializes) |
| 3. Sender-only rules | Upstream `RuleForm.tsx` exposes from-field static matching; Tier 1 short-circuits AI (the same path Greers List uses) |
| 4. Edit/delete | Upstream rule editor + list view do both |
| 5. Active rules serialized into classification prompt | Wired in Phase 3 via `getUserRulesPrompt`; empirically validated by 13 days of accurate classification (2026-05-05 → 2026-05-17) with 8 active rules. User reports classification has been doing "an excellent job" |
| 6. No login | Reinterpreted: kept Better Auth login as the safest call. RULES-06 "no login" was about friction, not auth removal. Single-tenant means staying signed in once. No new attack surface on the public domain. |

</outcome>

<decisions>
## Implementation Decisions

- **D-01: Phase 5 closed without writing code.** The upstream rules UI is mounted behind `/rules` and meets the spec.
- **D-02: RULES-06 reinterpreted.** "No login" → "low-friction once authenticated." Auth stays as Better Auth, no public-route shim, no signed-link write path. Rationale: zero new attack surface on `inbox.tdfurn.com`, no risk of leaking rule edits to anyone who guesses the URL.
- **D-03: No trimming of the upstream RuleForm.** It has more knobs than needed (conditional operators, multi-action editors, learned-pattern groups), but solo use hasn't surfaced that as friction. If it does later, capture as a usability todo, not a phase.

</decisions>

<canonical_refs>
## Canonical References

- `apps/web/app/(app)/rules/page.tsx` — Entry redirect
- `apps/web/app/(app)/[emailAccountId]/assistant/RuleForm.tsx` — Upstream form (1021 lines, full CRUD)
- `apps/web/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/page.tsx` — Edit route
- `apps/web/app/(app)/[emailAccountId]/assistant/rule/create/page.tsx` — Create route
- `apps/web/utils/ai/choose-rule/ai-choose-rule.ts` — Where `getUserRulesPrompt` serializes active rules into the classification prompt (RULES-05 wiring)
- `.planning/phases/03-classification-engine/03-CONTEXT.md` — Phase 3 decisions that wired RULES-05 indirectly

</canonical_refs>

<deferred>
## Deferred Ideas

- Trim/simplify the upstream RuleForm for solo use (hide conditional operators, multi-action editors, learned-pattern groups) — capture as backlog if friction emerges
- Custom minimal /rules landing page with a "what does this rule actually do?" prompt preview — nice-to-have, not blocking

</deferred>

---

*Phase: 5-rules-management-ui*
*Closed: 2026-05-17 — satisfied by upstream*
