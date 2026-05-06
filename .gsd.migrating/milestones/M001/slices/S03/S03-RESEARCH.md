# Phase 3: Classification Engine - Research

**Researched:** 2026-04-27
**Domain:** Email classification pipeline, Prisma migration, LLM model tier orchestration
**Confidence:** HIGH — all findings verified directly from codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Three-tier pipeline: Tier 1 = static rules (free), Tier 2 = Haiku (`economy` slot), Tier 3 = Sonnet (`default` slot). Successful Tier 1 match skips Tiers 2 and 3.
- **D-02:** Haiku→Sonnet escalation trigger: `confidenceScore < 0.8` OR `noMatchFound = true`. Strict less-than (0.8 stays with Haiku). Both conditions independently trigger escalation.
- **D-03:** Add `confidenceScore: z.number().min(0).max(1)` to Zod schema in `ai-choose-rule.ts`. Persist to `ExecutedRule.confidenceScore Float?` via Prisma migration.
- **D-04:** Replace 6 existing content rules (Cold Email, Calendar, Newsletter, Marketing, Notification, Receipt) with 8 canonical rules. Keep 4 conversation rules (To Reply, FYI, Awaiting Reply, Actioned).
- **D-05:** 8 canonical rules and actions: Receipts (LABEL+ARCHIVE+DIGEST), Deals (LABEL+ARCHIVE+DIGEST), Newsletters (LABEL+ARCHIVE+DIGEST), Marketing (LABEL+ARCHIVE), Urgent (LABEL only+DIGEST), 2FA (LABEL+DELETE after 24h), Uncertain (LABEL only+DIGEST), Greers List (LABEL+ARCHIVE, Tier 1 static).
- **D-06:** 4 conversation rules excluded from classification prompt. Classification prompt contains only 8 content rules.
- **D-07:** `multiRuleSelectionEnabled = false` — single category per email.
- **D-08:** Uncertain is an explicit Rule in DB (not code fallback). AI can actively select it.
- **D-09:** Uncertain stays in inbox (no ARCHIVE). Has LABEL+DIGEST action rows.
- **D-10:** Greers List = static Tier 1, `from: greers@trueocean.com`. Action: LABEL+ARCHIVE.
- **D-11:** 2FA classified by Haiku AI (not static regex). Auto-delete via `delayInMinutes: 1440` on DELETE Action row. Existing BullMQ infrastructure handles this.
- **D-12:** Deals rule: broad instructions to start. Refine via Phase 6 feedback.
- **D-13:** Set in SSM before deploying: `ECONOMY_LLM_PROVIDER=anthropic`, `ECONOMY_LLM_MODEL=claude-haiku-3-5` (verify latest model name at docs.anthropic.com).

### Claude's Discretion
- Confidence score tie-breaking when exactly = 0.8: implement as strict less-than (`< 0.8`). Scores of exactly 0.8 stay with Haiku.
- Conversation rule filter implementation: Claude to choose between excluding `isConversationStatusType()` rules vs. only including content rules — whichever is cleaner given the actual query structure.

### Deferred Ideas (OUT OF SCOPE)
- Per-sender deal thresholds (Harbor Freight, Home Depot) — Phase 6
- Automatic confidence-based graduation to Gmail filters — v2
- Classification accuracy dashboard/monitoring — v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLASS-01 | Every incoming email classified into exactly one of 8 categories | Rule seeding (8 new rules), `filterMultipleSystemRules` already enforces single match |
| CLASS-02 | Three-tier pipeline: rules engine → Haiku → Sonnet | Two-call escalation pattern in `ai-choose-rule.ts` at line 44 |
| CLASS-03 | Each classification includes confidence score stored in Postgres | Zod schema addition + Prisma migration to `ExecutedRule` |
| CLASS-04 | Urgent and Uncertain stay in inbox; all others labeled and archived | Action row configuration per rule (no ARCHIVE on Urgent/Uncertain) |
| CLASS-05 | 2FA emails auto-deleted after 24 hours | `delayInMinutes: 1440` on DELETE action row; BullMQ scheduler confirmed working |
| CLASS-06 | greers@trueocean.com emails labeled and archived | Static Tier 1 rule with `from: greers@trueocean.com` |
| CLASS-07 | Explicit user rules applied as highest-priority tier | `prepareRulesWithMetaRule` in `run-rules.ts` controls rule ordering; priority filtering needed |
| CLASS-08 | Pipeline processes emails within 2 minutes via PubSub | No changes needed to webhook; pipeline already meets this requirement |
</phase_requirements>

---

## Summary

Phase 3 modifies three areas of existing code and creates a seed/migration script for new rules. No new endpoints, no new tables beyond one column addition, and no new background jobs are required — the BullMQ delayed action infrastructure already handles 2FA deletion.

The primary code change is in `ai-choose-rule.ts`: the single `getAiResponse()` call must become a two-call pattern — first with `getModel(..., "economy")`, then (conditionally) with `getModel(..., "default")`. A `confidenceScore` field must be added to the Zod schema for the single-rule path (D-07 locks `multiRuleSelectionEnabled = false` so only the single-rule path is used). The score is then persisted when `executedRule.create()` is called in `run-rules.ts`.

The biggest operational risk is the rule replacement: the existing Newsletter rule is the **only** rule currently feeding the digest. If it is deleted before the new Newsletters rule is created with its DIGEST action, the digest pipeline starves. The rule seeding strategy must be an atomic replace — delete old, insert new — or, safer, create new rules first and delete old rules second.

**Primary recommendation:** Implement Phase 3 in three strictly-ordered waves: (1) Prisma migration + SSM vars (database-only), (2) rule seeding (data-only), (3) code changes to `ai-choose-rule.ts` and `run-rules.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email classification (Tier 1 static) | API / Backend (`match-rules.ts`) | — | Static regex + GroupItem matching runs server-side before any AI call |
| Email classification (Tier 2/3 AI) | API / Backend (`ai-choose-rule.ts`) | — | LLM call is an async operation within the webhook handler's `after()` block |
| Confidence score persistence | Database / Storage (`ExecutedRule`) | — | New `confidenceScore Float?` column; written by `prisma.executedRule.create()` |
| 2FA auto-delete scheduling | API / Backend (BullMQ scheduler) | Database / Storage | `scheduleDelayedActions()` writes `ScheduledAction` rows and enqueues to Upstash Redis |
| DIGEST action enqueueing | API / Backend (`actions.ts`) | Database / Storage | `enqueueDigestItem()` writes `DigestItem` row linking message to current `Digest` |
| Rule data seeding | Database / Storage | — | Direct Prisma upserts in a migration/seed script; no API layer needed |
| SSM environment configuration | CDN / Static (infra-level) | — | AWS Parameter Store vars read at container boot via `load-secrets.sh` |

---

## Codebase Findings

### Q1: How does `ai-choose-rule.ts` make its model call today?

**File:** `apps/web/utils/ai/choose-rule/ai-choose-rule.ts`

The entry function `aiChooseRule()` (line 20) calls `getAiResponse()` (line 44), which at line 94 reads:

```typescript
const modelType = "default"  // default parameter value
```

The single AI call is made at line 189 inside `getAiResponseSingleRule()`:

```typescript
const aiResponse = await generateObject({
  ...modelOptions,
  system,
  prompt,
  schema: z.object({
    reasoning: z.string()...,
    ruleName: z.string().nullable()...,
    noMatchFound: z.boolean()...,
  }),
});
```

`getAiResponse()` also routes to `getAiResponseMultiRule()` (line 110) when `hasCustomRules && emailAccount.multiRuleSelectionEnabled` is true. Since D-07 locks `multiRuleSelectionEnabled = false`, only the single-rule path is ever taken.

**What the two-call pattern looks like:** The `getAiResponse()` function signature already accepts an optional `modelType?: ModelType` parameter (line 14) and `aiChooseRule()` propagates it (line 47). The escalation logic should be added inside `getAiResponse()`:

```typescript
// In getAiResponse():
// First call with economy (Haiku)
const economyModelOptions = getModel(emailAccount.user, "economy");
const haiku_result = await getAiResponseSingleRule({
  ...options,
  modelOptions: economyModelOptions,
  generateObject: createGenerateObject({ ..., modelOptions: economyModelOptions }),
});

if (haiku_result.result.noMatchFound || (haiku_result.result.confidenceScore ?? 0) < 0.8) {
  // Escalate to Sonnet
  const defaultModelOptions = getModel(emailAccount.user, "default");
  const sonnet_result = await getAiResponseSingleRule({
    ...options,
    modelOptions: defaultModelOptions,
    generateObject: createGenerateObject({ ..., modelOptions: defaultModelOptions }),
  });
  return { result: sonnet_result.result, modelOptions: defaultModelOptions };
}
return { result: haiku_result.result, modelOptions: economyModelOptions };
```

Note: `getAiResponse()` returns `{ result, modelOptions }` — the planner can expose `modelOptions.modelName` for logging which tier was used.

### Q2: Zod schema changes and migration needed

**Current Zod schema** (single-rule mode, `ai-choose-rule.ts` line 192):

```typescript
schema: z.object({
  reasoning: z.string().describe("The reason you chose the rule. Keep it concise"),
  ruleName: z.string().nullable().describe("The exact name of the rule you want to apply"),
  noMatchFound: z.boolean().describe("True if no match was found, false otherwise"),
})
```

**Required change:** Add `confidenceScore: z.number().min(0).max(1).describe("Confidence level 0-1 for this classification")` to this schema.

**`getAiResponseSingleRule` return type** (lines 207-219): The function constructs `result` from `aiResponse.object` properties. After adding `confidenceScore` to the schema, it must be extracted: `confidenceScore: aiResponse.object.confidenceScore`.

**The `getAiResponse()` return type** (lines 82-88) currently returns:
```typescript
{
  result: {
    matchedRules: { ruleName: string; isPrimary?: boolean }[];
    reasoning: string;
    noMatchFound: boolean;
  };
  modelOptions: ReturnType<typeof getModel>;
}
```
Must add `confidenceScore?: number` to `result`.

**`aiChooseRule()` return type** (lines 36-39) returns `{ rules: ...; reason: string }` — also needs `confidenceScore?: number` if the planner wants it surfaced to the caller.

**Prisma migration:** Add to `ExecutedRule` model in `apps/web/prisma/schema.prisma`:
```prisma
confidenceScore Float?  // AI classification confidence 0-1; null for static/learned matches
```

Migration command: `pnpm prisma migrate dev --name add_confidence_score_to_executed_rule` (run from `apps/web`). The migration SQL will be:
```sql
ALTER TABLE "ExecutedRule" ADD COLUMN "confidenceScore" DOUBLE PRECISION;
```

**Where to write the score:** In `run-rules.ts` `executeMatchedRule()` at line 462, the `prisma.executedRule.create()` call. The `confidenceScore` must be threaded from `aiChooseRule()`'s return value through `findMatchingRulesWithReasons()` → `findMatchingRules()` → `runRules()` → `executeMatchedRule()`. This is a multi-function threading task.

### Q3: Rule seeding strategy

**No seed script exists in the codebase.** [VERIFIED: searched `find ... -name "seed*.ts"`] The existing 10 production rules were created by Inbox Zero's onboarding UI, not by a programmatic script.

**Production rule inventory** (from RECON.md, confirmed 2026-04-27):

| Name | systemType | Action rows | Fate |
|------|------------|-------------|------|
| To Reply | TO_REPLY | LABEL + DRAFT_EMAIL | KEEP |
| FYI | FYI | LABEL | KEEP |
| Awaiting Reply | AWAITING_REPLY | LABEL | KEEP |
| Actioned | ACTIONED | LABEL | KEEP |
| Cold Email | COLD_EMAIL | LABEL + ARCHIVE | DELETE |
| Calendar | CALENDAR | LABEL | DELETE |
| Newsletter | NEWSLETTER | LABEL + **DIGEST** | DELETE (after creating new Newsletters rule) |
| Marketing | MARKETING | LABEL + ARCHIVE | DELETE |
| Notification | NOTIFICATION | LABEL | DELETE |
| Receipt | RECEIPT | LABEL | DELETE |

**Critical:** Newsletter is the only rule currently feeding the digest. New Newsletters rule must be created with DIGEST action BEFORE deleting the old Newsletter rule.

**Recommended seeding approach:** A standalone TypeScript script that uses the Prisma client directly:

```typescript
// scripts/seed-phase3-rules.ts
import prisma from "@/utils/prisma";

async function seedPhase3Rules() {
  const emailAccount = await prisma.emailAccount.findFirstOrThrow({
    where: { email: "rebekah@trueocean.com" }
  });
  
  // Step 1: Create 8 new rules (upsert by name to be idempotent)
  // Step 2: Delete 6 old content rules
}
```

The script is run once with `npx tsx scripts/seed-phase3-rules.ts` (or `pnpm tsx`). It should be idempotent — using `upsert` on `name + emailAccountId` (which has a `@@unique` constraint in the schema).

**Important constraint:** `Rule` has `@@unique([name, emailAccountId])` and `@@unique([emailAccountId, systemType])`. The 8 new canonical rules should have `systemType: null` (they are user-defined, not system presets), so there is no systemType uniqueness conflict. The `@@unique([emailAccountId, systemType])` constraint only applies to systemType values that exist in the enum — null values are not constrained.

**New rules should NOT have a systemType field set.** The 4 conversation rules use systemType for `isConversationStatusType()` detection. The 8 content rules should have `systemType: null` to avoid any interaction with conversation tracking code.

### Q4: Filtering conversation rules from the AI prompt

**Where the filter should be applied:** `findPotentialMatchingRules()` in `match-rules.ts` receives `rules: RuleWithActions[]`. The rules list comes from `findMatchingRules()` (line 117 in `match-rules.ts`), which receives `regularRules` from `prepareRulesWithMetaRule()` in `run-rules.ts`.

**How conversation rules are already separated:** `prepareRulesWithMetaRule()` in `run-rules.ts` (line 277) already does this:

```typescript
const conversationRules = rules.filter((r) => isConversationStatusType(r.systemType));
const regularRules = rules.filter((r) => !isConversationStatusType(r.systemType));
```

The `conversationRules` are replaced with a single `metaRule` ("Conversations") and appended to `regularRules`. This means the AI currently DOES see conversation rules (as a meta-rule) alongside content rules.

**What D-06 requires:** The classification prompt passed to Haiku/Sonnet must contain only the 8 content rules. The conversation meta-rule must NOT be included in the classification prompt.

**Clean approach:** Since the 8 new content rules will all have `systemType: null`, the classification-only AI prompt can simply exclude any rule with `systemType` set. The `potentialAiMatches` array in `findPotentialMatchingRules()` is already filtered via `filterConversationStatusRulesWithMetadata()` (line 272). However, this filter only removes conversation rules from AI candidate matches when certain conditions apply (noreply sender, reply history threshold). It does not unconditionally exclude the conversation meta-rule.

**Actual recommended filter point:** Filter at `findPotentialMatchingRules()` input: when assembling `potentialAiMatches`, only include rules where `rule.systemType === null`. The conversation meta-rule has `systemType: null` (set explicitly in `prepareRulesWithMetaRule()` at line 299: `systemType: null`) — but it has `id === CONVERSATION_TRACKING_META_RULE_ID`. The filter should exclude by both `systemType !== null` and `id === CONVERSATION_TRACKING_META_RULE_ID`.

Alternatively, since `filterConversationStatusRulesWithMetadata()` already handles the meta-rule filtering, the simpler change is to ensure the conversation meta-rule never makes it into `potentialAiMatches`. The loop at line 181 in `match-rules.ts` checks `isConversationStatusType(rule.systemType)` for the CALENDAR special case. The meta-rule with id `CONVERSATION_TRACKING_META_RULE_ID` will flow through the normal path and end up in `potentialAiMatches` if it has instructions (which it does — `CONVERSATION_TRACKING_INSTRUCTIONS`).

**Cleanest fix:** In `evaluateRuleConditions()` (already exported), or at the loop entry in `findPotentialMatchingRules()`, add a guard:
```typescript
if (rule.id === CONVERSATION_TRACKING_META_RULE_ID) continue;
```
This prevents the meta-rule from ever entering the AI classification path.

### Q5: Action rows and 2FA deletion

**BullMQ delayed action infrastructure is confirmed working** [VERIFIED: `scheduleDelayedActions()` in `run-rules.ts` lines 561-567].

In `executeMatchedRule()` (run-rules.ts line 444-448):
```typescript
const { immediateActions, delayedActions } = groupBy(actionItems, (item) =>
  item.delayInMinutes != null && item.delayInMinutes > 0
    ? "delayedActions"
    : "immediateActions",
);
```

Delayed actions are passed to `scheduleDelayedActions()` (line 562) which writes `ScheduledAction` rows and enqueues via Upstash Redis. The BullMQ worker processes them when the delay expires.

**For 2FA:** Create a DELETE action row with `delayInMinutes: 1440`. The existing scheduler handles this without any code changes.

**For ARCHIVE:** Create an ARCHIVE action row with `delayInMinutes: null` (immediate). No changes to executor needed.

**For LABEL:** Create a LABEL action row with `label: "Receipts"` (or whatever label name). Gmail label IDs are resolved at runtime by `executeAct()`.

**Premium check on DIGEST action** (`actions.ts` line 459-466): The DIGEST action handler calls `checkHasAccess({ minimumTier: "PLUS_MONTHLY" })`. If `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true` is set in SSM, this returns `true` immediately. The `.env.example` shows this is `true` by default for self-hosted. **MUST VERIFY** this is set in production SSM before deploying DIGEST actions.

### Q6: How DIGEST action works

**File:** `apps/web/utils/ai/actions.ts`, DIGEST case handler (line 91, 452-476).

When a rule's action has `type: ActionType.DIGEST`:
1. `executeAct()` in the execute pipeline reaches the DIGEST case
2. Calls `checkHasAccess({ userId, minimumTier: "PLUS_MONTHLY" })` — returns true if `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true`
3. Calls `enqueueDigestItem({ email, emailAccountId, actionId, logger })`
4. `enqueueDigestItem()` in `utils/digest/index.ts` writes a `DigestItem` row with `content` = AI-summarized JSON

**The DIGEST action requires an `args.id`** (line 459: `if (!args.id) return`). This `args.id` is the `ExecutedAction.id` (the action row that was executed). It is populated at runtime by `getActionItemsWithAiArgs()` — which copies the action ID from the Rule's Action row.

**Phase 4 compatibility:** The `DigestItem.content` is a JSON string matching `storedDigestContentSchema: { content: string }`. DigestItems are redacted after digest send. Feedback links in Phase 4 digest email must encode email identity in URL token since content is gone after send.

### Q7: Prisma migration flow

**Migration infrastructure:** Fully operational. The `apps/web/prisma/migrations/` directory contains 60+ migration files. Latest migration is `20260426000000_add_admin_premium_grants`.

**Correct flow for adding `confidenceScore Float?`:**
1. Edit `apps/web/prisma/schema.prisma` — add `confidenceScore Float?` to `ExecutedRule` model
2. From `apps/web`: `pnpm prisma migrate dev --name add_confidence_score_to_executed_rule`
3. This generates a new migration file and applies it to the local DB
4. Commit the migration file to git
5. In production: `docker compose exec app npx prisma migrate deploy` — or it runs automatically on container start (per CLAUDE.md: "`pnpm build` runs `prisma migrate deploy` first")

**Migration SQL:** Simple ALTER TABLE, no backfill needed (nullable column):
```sql
ALTER TABLE "ExecutedRule" ADD COLUMN "confidenceScore" DOUBLE PRECISION;
```

### Q8: SSM env var integration — how `getModel` resolves

**File:** `apps/web/utils/llms/model.ts`

`getModel(user, "economy")` calls `selectModelByType(user, "economy")` which calls `selectEconomyModel()`.

`selectEconomyModel()` (line 358):
1. Checks `if (env.ECONOMY_LLM_PROVIDER && env.ECONOMY_LLM_MODEL)` — both must be set
2. Calls `getProviderApiKey(env.ECONOMY_LLM_PROVIDER)` — for `"anthropic"` this resolves `env.ANTHROPIC_API_KEY`
3. If API key not found: logs warning, falls back to `selectDefaultModel()` (Sonnet)
4. If both set: calls `selectModel({ aiProvider: "anthropic", aiModel: "claude-haiku-3-5", aiApiKey: <ANTHROPIC_API_KEY> })`

The Anthropic provider case (line 305) creates `createAnthropic({ apiKey })("claude-haiku-3-5")`.

**SSM variables to set:**
- `ECONOMY_LLM_PROVIDER=anthropic`
- `ECONOMY_LLM_MODEL=claude-haiku-3-5` (verify model name at docs.anthropic.com before setting — CONTEXT.md D-13 notes this)
- `NANO_LLM_PROVIDER=anthropic`
- `NANO_LLM_MODEL=claude-haiku-3-5` (for digest summarization, per RECON.md prerequisites)

**User API key bypass:** Line 79 in model.ts: `if (userAi.aiApiKey) return selectDefaultModel(userAi, online)`. If a user has set their own API key in account settings, `selectModelByType()` always returns default model. For the single-tenant self-hosted fork, this path is not used (no user API key set).

**ANTHROPIC_API_KEY resolution** (line 584): `resolveApiKey(null, env.ANTHROPIC_API_KEY)` → returns `env.ANTHROPIC_API_KEY || env.LLM_API_KEY`. The `LLM_API_KEY` is a fallback for any provider. Production has `ANTHROPIC_API_KEY` set in SSM (confirmed by recon — existing Sonnet calls work).

### Q9: Production rule inspection

**Confirmed 10 rules in production** (RECON.md open question 2, verified 2026-04-27). Full inventory in Q3 table above. All 10 are systemType-based upstream rules; no custom Rebekah rules exist. The 6 content rules to replace: Cold Email, Calendar, Newsletter, Marketing, Notification, Receipt.

### Q10: Test coverage patterns

**Test framework:** Vitest 4.1.4. Config at `apps/web/vitest.config.mts`. Run from repo root with `pnpm test` (or `pnpm test -- path/to/file.test.ts` for specific file).

**Existing test files relevant to Phase 3:**
- `apps/web/utils/ai/choose-rule/match-rules.test.ts` — tests `matchesStaticRule`, `filterConversationStatusRules`, `evaluateRuleConditions`, `filterMultipleSystemRules`, `findMatchingRules`; uses `vi.mock("@/utils/ai/choose-rule/ai-choose-rule")` to mock AI
- `apps/web/utils/ai/choose-rule/run-rules.test.ts` — tests `runRules`, `ensureConversationRuleContinuity`, `limitDraftEmailActions`; mocks `findMatchingRules`, `getActionItemsWithAiArgs`, `executeAct`

**Pattern:** Tests mock prisma (`vi.mock("@/utils/prisma")`), mock AI calls (`vi.mock("@/utils/ai/choose-rule/ai-choose-rule")`), and test pure logic. Integration tests in `__tests__/integration/` require a live DB.

**Phase 3 tests should follow this pattern:**
- Unit test the escalation logic in `ai-choose-rule.ts` — mock `createGenerateObject`, test that when Haiku returns `confidenceScore < 0.8`, the function calls the default model
- Unit test the conversation meta-rule filter guard
- Unit test that `confidenceScore` is correctly extracted from AI response and returned

---

## Implementation Approach

### Approach 1: Haiku→Sonnet Escalation in `ai-choose-rule.ts`

The `getAiResponse()` function at line 82 is the right insertion point. It already receives `modelType` as a parameter and calls `getModel()`.

**Change pattern:**

```typescript
async function getAiResponse(options: GetAiResponseOptions): Promise<{
  result: {
    matchedRules: { ruleName: string; isPrimary?: boolean }[];
    reasoning: string;
    noMatchFound: boolean;
    confidenceScore?: number;  // ADD
    modelUsed?: string;        // ADD for logging
  };
  modelOptions: ReturnType<typeof getModel>;
}> {
  const { email, emailAccount, rules, classificationFeedback } = options;

  // Tier 2: Haiku (economy)
  const economyModelOptions = getModel(emailAccount.user, "economy");
  const economyGenerateObject = createGenerateObject({
    emailAccount,
    label: "Choose rule (economy)",
    modelOptions: economyModelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  const { result: haiku_result } = await getAiResponseSingleRule({
    email, emailAccount, rules, modelOptions: economyModelOptions,
    generateObject: economyGenerateObject, classificationFeedback,
  });

  const shouldEscalate = haiku_result.noMatchFound ||
    (haiku_result.confidenceScore ?? 0) < 0.8;

  if (!shouldEscalate) {
    return { result: haiku_result, modelOptions: economyModelOptions };
  }

  // Tier 3: Sonnet (default)
  const defaultModelOptions = getModel(emailAccount.user, "default");
  const defaultGenerateObject = createGenerateObject({
    emailAccount,
    label: "Choose rule (escalated)",
    modelOptions: defaultModelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  const { result: sonnet_result } = await getAiResponseSingleRule({
    email, emailAccount, rules, modelOptions: defaultModelOptions,
    generateObject: defaultGenerateObject, classificationFeedback,
  });

  return { result: sonnet_result, modelOptions: defaultModelOptions };
}
```

Note: The existing `modelType` parameter on `getAiResponse()` can be removed or kept as a passthrough override for testing. For Phase 3, the escalation logic replaces it.

### Approach 2: Rule Seeding

**Strategy:** Create a TypeScript script `apps/web/scripts/seed-phase3-rules.ts`. Execute via `npx tsx apps/web/scripts/seed-phase3-rules.ts`. The script should:

1. Fetch the emailAccountId for `rebekah@trueocean.com`
2. Upsert 8 new content rules by name (use `upsert` with `where: { name_emailAccountId: ... }`)
3. For each rule, use `createMany` to create action rows (delete existing actions first for idempotency)
4. After all 8 new rules exist and verified, delete the 6 old content rules by systemType

**Rule definitions:**

```typescript
const PHASE3_RULES = [
  {
    name: "Receipts",
    instructions: "Order confirmations, purchase receipts, payment confirmations, and transaction records from any retailer or service.",
    actions: [
      { type: ActionType.LABEL, label: "Receipts" },
      { type: ActionType.ARCHIVE },
      { type: ActionType.DIGEST },
    ]
  },
  {
    name: "Deals",
    instructions: "Promotional emails offering discounts, sales, or limited-time offers on products or services.",
    actions: [
      { type: ActionType.LABEL, label: "Deals" },
      { type: ActionType.ARCHIVE },
      { type: ActionType.DIGEST },
    ]
  },
  {
    name: "Newsletters",
    instructions: "Regular newsletter subscriptions, blog digests, curated content emails, and periodic updates from publications or content creators. Look for List-Unsubscribe headers as a strong signal.",
    actions: [
      { type: ActionType.LABEL, label: "Newsletters" },
      { type: ActionType.ARCHIVE },
      { type: ActionType.DIGEST },
    ]
  },
  {
    name: "Marketing",
    instructions: "Promotional and marketing emails that don't offer specific deals — brand announcements, product launches, company updates, re-engagement campaigns, and general advertising.",
    actions: [
      { type: ActionType.LABEL, label: "Marketing" },
      { type: ActionType.ARCHIVE },
    ]
  },
  {
    name: "Urgent",
    instructions: "Emails requiring immediate attention or action: account security alerts, time-sensitive requests from real people, payment failures, service outages, or anything the recipient must act on today.",
    actions: [
      { type: ActionType.LABEL, label: "Urgent" },
      // No ARCHIVE — stays in inbox
      { type: ActionType.DIGEST },
    ]
  },
  {
    name: "2FA",
    instructions: "Two-factor authentication codes, one-time passwords (OTP), verification codes, and login confirmation emails. These are typically short, contain a numeric or alphanumeric code, and are time-sensitive.",
    actions: [
      { type: ActionType.LABEL, label: "2FA" },
      { type: ActionType.DELETE, delayInMinutes: 1440 },
    ]
  },
  {
    name: "Uncertain",
    instructions: "Emails that don't clearly fit any of the other categories — ambiguous content, unclear sender intent, or mixed signals. Use this only when genuinely unsure; prefer other categories when any reasonable match exists.",
    actions: [
      { type: ActionType.LABEL, label: "Uncertain" },
      // No ARCHIVE — stays in inbox
      { type: ActionType.DIGEST },
    ]
  },
  {
    name: "Greers List",
    from: "greers@trueocean.com",
    instructions: null,  // Static-only rule, no AI instructions
    actions: [
      { type: ActionType.LABEL, label: "Greers List" },
      { type: ActionType.ARCHIVE },
    ]
  },
];

const OLD_SYSTEM_TYPES = [
  SystemType.COLD_EMAIL,
  SystemType.CALENDAR,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.NOTIFICATION,
  SystemType.RECEIPT,
];
```

**Greers List rule specifics:** Set `from: "greers@trueocean.com"`, no `instructions`, `conditionalOperator: LogicalOperator.OR`. With no `instructions` and a `from` static field, `matchesStaticRule()` will match it directly. The rule will never reach AI because it has no instructions and `isAIRule()` will return false.

### Approach 3: Confidence Score Threading

The confidence score must flow from `getAiResponseSingleRule()` → `getAiResponse()` → `aiChooseRule()` → `findMatchingRulesWithReasons()` → back to `runRules()` where `executedRule.create()` is called.

**Functions to update:**
1. `getAiResponseSingleRule()` — extract `confidenceScore` from `aiResponse.object` and return it
2. `getAiResponse()` — add `confidenceScore?: number` to returned `result`
3. `aiChooseRule()` return type — add `confidenceScore?: number`
4. `findMatchingRulesWithReasons()` — thread `confidenceScore` from `aiChooseRule()` result through to `MatchingRulesResult`
5. `runRules()` `RunRulesResult` type — add `confidenceScore?: number`
6. `executeMatchedRule()` — pass `confidenceScore` to `prisma.executedRule.create()`
7. `prisma.executedRule.create()` call — add `confidenceScore: confidenceScore ?? null`

### Approach 4: Conversation Rule Exclusion from Classification Prompt

In `findPotentialMatchingRules()` in `match-rules.ts`, at the start of the rule loop (line 182), add:

```typescript
for (const rule of rules) {
  // Exclude the conversation tracking meta-rule from content classification
  if (rule.id === CONVERSATION_TRACKING_META_RULE_ID) continue;
  // ... rest of loop
```

Import `CONVERSATION_TRACKING_META_RULE_ID` from `run-rules.ts`. This is a one-line guard that cleanly prevents the meta-rule from polluting the classification prompt.

Note: The conversation meta-rule still exists in `regularRules` (it's added by `prepareRulesWithMetaRule()`), so the conversation tracking mechanism still works — it just won't influence the content classification AI call.

---

## Standard Stack

### Core (no additions needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 6.x (existing) | ORM + migrations | Already in use; `migrate dev` generates migration file |
| Vercel AI SDK | 4.x (existing) | LLM calls via `generateObject` | Already in use; `createGenerateObject` wrapper handles hardening |
| Zod | 3.x (existing) | Schema validation for AI output | Already used in all AI schemas |
| Vitest | 4.1.4 (existing) | Unit tests | Already configured; `pnpm test` from repo root |

**No new dependencies required for Phase 3.**

### Installation
No new packages to install.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Delayed 2FA deletion | Custom cron job | `delayInMinutes: 1440` on Action row + existing BullMQ scheduler | `scheduleDelayedActions()` already handles this |
| Prompt injection defense | Custom sanitization | `promptHardening: { trust: "untrusted", level: "full" }` in `createGenerateObject()` | Already implemented; bypass would create security regression |
| AI structured output | Raw JSON parsing | `generateObject()` with Zod schema | Type-safe output; already the pattern |
| DIGEST enqueueing | Direct DB write | `enqueueDigestItem()` in `utils/digest/index.ts` | Handles Digest row creation and linking |
| Rule uniqueness | Manual check | `@@unique([name, emailAccountId])` constraint + Prisma `upsert` | DB enforces uniqueness; upsert handles idempotency |

---

## Risk Areas

### Risk 1: Newsletter→Newsletters DIGEST continuity gap
**What could go wrong:** If the old Newsletter rule (the only rule currently feeding the digest) is deleted before the new Newsletters rule is created and verified, the digest pipeline starves silently.
**Severity:** HIGH — digest stops receiving items; no error thrown.
**Mitigation:** In the seed script, ALWAYS create/verify new rules first, delete old rules last. Make the script idempotent so it can be re-run safely.

### Risk 2: DIGEST action premium check blocks action
**What could go wrong:** If `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS` is not set to `true` in production SSM, the `checkHasAccess()` call in the DIGEST handler returns false for a non-premium account, silently skipping all DIGEST actions.
**Severity:** HIGH — digest never receives items; silent failure.
**Mitigation:** Verify `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true` is in SSM before deploying. Wave 0 task should check this.

### Risk 3: Economy model fallback before SSM vars are set
**What could go wrong:** If the code change to use `economy` model type is deployed BEFORE `ECONOMY_LLM_PROVIDER` is set in SSM, all classification calls fall back to Sonnet. Not a data corruption risk, but defeats the cost optimization purpose.
**Severity:** MEDIUM — cost problem, not correctness problem.
**Mitigation:** Set SSM vars in Wave 0 (or as the very first step of Wave 1) before deploying code changes.

### Risk 4: `@@unique([emailAccountId, systemType])` constraint on new rules
**What could go wrong:** If any new canonical rule is accidentally given a `systemType` value that already exists for the account, Prisma upsert will fail with a unique constraint violation.
**Severity:** LOW — but would break the seed script.
**Mitigation:** All 8 new canonical rules should have `systemType: null` (verified as correct approach in Q3 above). Do not set systemType on content rules.

### Risk 5: confidenceScore threading breaks existing test mocks
**What could go wrong:** The `aiChooseRule` mock in `match-rules.test.ts` (line 42) returns a fixed object that won't include `confidenceScore`. If the real type now requires it and tests don't update the mock, TypeScript compilation fails.
**Severity:** MEDIUM — build breaks; caught at compile time.
**Mitigation:** Use optional `confidenceScore?: number` in the return type. Update mocks in `match-rules.test.ts` when updating the type.

### Risk 6: Greers List static rule never triggers if instructions field is null
**What could go wrong:** `matchesStaticRule()` tests `from`, `to`, `subject`, `body` fields. If `from: "greers@trueocean.com"` is set correctly and other fields are null/empty, the rule matches. But if `isAIRule()` is checked somewhere and the rule has neither instructions nor static conditions, it might be skipped.
**Severity:** LOW — `matchesStaticRule()` returns `false` only when all fields are null/empty (line 629: `if (!from && !to && !subject && !body) return false`). With `from` set, this returns true.
**Mitigation:** Verify Greers List rule has `from: "greers@trueocean.com"` and `conditionalOperator: LogicalOperator.OR` so the static `from` match alone is sufficient.

### Risk 7: `filterConversationStatusRulesWithMetadata` interferes with content rule filtering
**What could go wrong:** This function (match-rules.ts line 772) removes conversation rules from `potentialAiMatches` under certain conditions. If the new content rules are somehow classified as conversation rules (they won't be, since they have `systemType: null`), they'd be filtered.
**Severity:** LOW — only affects rules with `isConversationStatusType(systemType)`, which requires one of the 4 conversation systemType values. New content rules have `systemType: null`.
**Mitigation:** Confirm new rules have `systemType: null`. No additional action needed.

---

## Plan Structure Recommendation

### Wave 0: Prerequisites (no code, no deploy risk)
1. **Task 0-1:** Verify `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true` in production SSM
2. **Task 0-2:** Verify Anthropic API credit balance at console.anthropic.com
3. **Task 0-3:** Verify Haiku model name (claude-haiku-3-5 vs claude-haiku-3-5-20241022 vs claude-haiku-4) — check docs.anthropic.com
4. **Task 0-4:** Set `ECONOMY_LLM_PROVIDER=anthropic` and `ECONOMY_LLM_MODEL=<verified-name>` in SSM
5. **Task 0-5:** Set `NANO_LLM_PROVIDER=anthropic` and `NANO_LLM_MODEL=<verified-name>` in SSM

### Wave 1: Database Migration (deploy to production first)
1. **Task 1-1:** Add `confidenceScore Float?` to `ExecutedRule` in schema.prisma
2. **Task 1-2:** Run `pnpm prisma migrate dev --name add_confidence_score` from `apps/web`
3. **Task 1-3:** Apply migration to production via deploy (migration runs on container start)

### Wave 2: Rule Seeding (data change, no code deploy)
1. **Task 2-1:** Write `apps/web/scripts/seed-phase3-rules.ts` with 8 new rules and deletion of 6 old rules
2. **Task 2-2:** Test script on local DB (dry-run)
3. **Task 2-3:** Run script on production via SSH: `docker compose exec app npx tsx scripts/seed-phase3-rules.ts`
4. **Task 2-4:** Verify new rules exist in production DB; verify Newsletter → Newsletters DIGEST continuity

### Wave 3: Code Changes (code deploy)
1. **Task 3-1:** Add `confidenceScore` to Zod schema in `getAiResponseSingleRule()` (`ai-choose-rule.ts`)
2. **Task 3-2:** Implement two-call escalation in `getAiResponse()` (`ai-choose-rule.ts`)
3. **Task 3-3:** Thread `confidenceScore` through return types and function signatures
4. **Task 3-4:** Write `confidenceScore` to `executedRule.create()` in `run-rules.ts`
5. **Task 3-5:** Add conversation meta-rule exclusion guard in `findPotentialMatchingRules()` (`match-rules.ts`)
6. **Task 3-6:** Write/update unit tests for escalation logic and conversation filter
7. **Task 3-7:** Build + deploy to production

### Wave 4: Verification
1. **Task 4-1:** Send a test email to rebekah@trueocean.com; verify classification in DB
2. **Task 4-2:** Verify `confidenceScore` is populated in `ExecutedRule` rows
3. **Task 4-3:** Verify Greers List email is classified by static rule (no AI call)
4. **Task 4-4:** Verify digest items are being created for Receipts/Deals/Newsletters/Urgent/Uncertain rules
5. **Task 4-5:** Verify 2FA email classification and scheduled DELETE action in `ScheduledAction` table

**Dependencies:**
- Wave 1 must complete before Wave 3 (schema must exist before code writes to it)
- Wave 2 must complete before Wave 3 (rules must exist before classification runs)
- Wave 0 must complete before Wave 2 and Wave 3 (SSM vars must be set before Haiku calls)
- Wave 4 requires all previous waves

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `apps/web/vitest.config.mts` |
| Quick run command | `pnpm test -- match-rules.test.ts` |
| Full suite command | `pnpm test` (from repo root) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLASS-01 | 8 categories, exactly one match | unit | `pnpm test -- match-rules.test.ts` | ✅ (extend existing) |
| CLASS-02 | Three-tier pipeline: static → Haiku → Sonnet | unit | `pnpm test -- ai-choose-rule.test.ts` | ❌ Wave 0 |
| CLASS-03 | confidenceScore stored in ExecutedRule | unit | `pnpm test -- run-rules.test.ts` | ✅ (extend existing) |
| CLASS-04 | Urgent/Uncertain stay in inbox | manual-only | SSH: query ExecutedRule after test email | — |
| CLASS-05 | 2FA auto-deleted after 24h | manual-only | Check ScheduledAction table after 2FA test email | — |
| CLASS-06 | Greers List static match | unit | `pnpm test -- match-rules.test.ts` | ✅ (extend existing) |
| CLASS-07 | User rules as highest-priority tier | unit | `pnpm test -- match-rules.test.ts` | ✅ (extend existing) |
| CLASS-08 | Classification within 2 minutes | manual-only | Send test email, monitor logs | — |

### Wave 0 Gaps (new test files needed)

- [ ] `apps/web/utils/ai/choose-rule/ai-choose-rule.test.ts` — covers CLASS-02 (escalation logic)
  - Test: Haiku confidence 0.9 → no escalation
  - Test: Haiku confidence 0.7 → escalation to Sonnet
  - Test: Haiku noMatchFound=true → escalation to Sonnet
  - Test: Haiku confidence exactly 0.8 → no escalation (strict less-than)

### Sampling Rate
- **Per task commit:** `pnpm test -- [specific test file]`
- **Per wave merge:** `pnpm test` (full suite, ~30s)
- **Phase gate:** Full suite green + manual verification of CLASS-04, CLASS-05, CLASS-08

---

## Project Constraints (from CLAUDE.md)

- Linter: Biome (`pnpm lint`), not ESLint. All new code must pass Biome.
- Prisma commands run from `apps/web`, not repo root.
- Migration deploys automatically on container start (built into `pnpm build`).
- All LLM calls must use `createGenerateObject()` with `promptHardening: { trust: "untrusted", level: "full" }` — never raw `generateObject()`.
- `EMAIL_ENCRYPT_SECRET` and `EMAIL_ENCRYPT_SALT` must never be rotated — not relevant to Phase 3 but included for awareness.
- Cron endpoints use `Authorization: Bearer <CRON_SECRET>` — not relevant to Phase 3.
- Do not run bulk email processing through UI — relevant to Phase 7, not Phase 3.
- AI cost ceiling: $10/mo additional. Three-tier architecture is non-negotiable.

---

## Open Questions (RESOLVED)

1. **Haiku model name verification** — RESOLVED: Delegated to 03-01 Task 1 (blocking human checkpoint: visit docs.anthropic.com/en/docs/about-claude/models, record exact API identifier before setting SSM).

2. **`NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS` in production SSM** — RESOLVED: 03-01 Task 3 verifies and sets this before any seeding. Blocks Wave 2.

3. **`getUserRulesPrompt()` with `instructions: null` for Greers List** — RESOLVED: Already handled by existing logic. Greers List matches via `matchesStaticRule()` and never reaches `potentialAiMatches`. No change needed.

4. **CLASS-07: "Explicit user rules as highest-priority tier"** — RESOLVED: Phase 3 partially delivers CLASS-07. All 8 canonical rules have `systemType=null` and take priority over the conversation meta-rule in the AI candidate list. Full user-authored rule priority completes in Phase 5 (Rules Management UI). The conversation meta-rule exclusion guard in 03-04 Task 2 handles the ordering.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| AWS SSM (ECONOMY_LLM vars) | CLASS-02 Haiku tier | ✗ (not yet set) | — | Falls back to Sonnet (cost issue, not correctness) |
| NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS | CLASS-02 DIGEST actions | Unknown | — | DIGEST actions silently skip |
| Anthropic API credits | All AI tiers | ✓ (prepaid, balance unknown) | — | Must top up if balance low |
| Local Postgres | Wave 1 migration testing | ✓ | (existing) | — |
| BullMQ / Upstash Redis | CLASS-05 2FA deletion | ✓ (existing) | — | — |

**Missing dependencies with no fallback:**
- SSM vars for Haiku (`ECONOMY_LLM_PROVIDER`, `ECONOMY_LLM_MODEL`) — must be set in Wave 0 before code deploy

**Missing dependencies requiring verification:**
- `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS` — verify in Wave 0 before rule seeding

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `claude-haiku-3-5` is the correct API model name for Haiku | Q8, Wave 0 | SSM var set to wrong name; economy calls fail to resolve model, fall back to Sonnet |
| A2 | `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true` is set in production SSM | Q5 Risk Area | DIGEST actions silently skip; digest receives no items from new rules |
| A3 | Email volume of 20-50 emails/day used in cost estimate | Cost analysis (RECON.md) | Cost estimates could be significantly off; monitor Anthropic dashboard after deploy |

---

## Sources

### Primary (HIGH confidence — verified from codebase)
- `apps/web/utils/ai/choose-rule/ai-choose-rule.ts` — Full file read; confirmed Zod schema, model call pattern, single-rule vs multi-rule routing
- `apps/web/utils/ai/choose-rule/match-rules.ts` — Full file read; confirmed `findPotentialMatchingRules`, `filterConversationStatusRulesWithMetadata`, `matchesStaticRule`, conversation meta-rule injection point
- `apps/web/utils/ai/choose-rule/run-rules.ts` — Full file read; confirmed `executeMatchedRule`, `prisma.executedRule.create()` call site, `scheduleDelayedActions()` for delayed actions, `prepareRulesWithMetaRule()` conversation rule separation
- `apps/web/utils/llms/model.ts` — Full file read; confirmed `selectEconomyModel()` fallback logic, `ECONOMY_LLM_PROVIDER` + `ECONOMY_LLM_MODEL` both required, ANTHROPIC_API_KEY resolution
- `apps/web/prisma/schema.prisma` — Lines 448-588 read; confirmed `ExecutedRule` model (no confidenceScore), `Rule` model, `Action` model, `@@unique` constraints, `SystemType` enum values
- `apps/web/utils/ai/actions.ts` — DIGEST case confirmed at line 91; premium check at line 460; `enqueueDigestItem()` at line 470
- `apps/web/utils/reply-tracker/conversation-status-config.ts` — Confirmed `CONVERSATION_STATUS_TYPES` array and `isConversationStatusType()` function
- `apps/web/utils/ai/helpers.ts` — Confirmed `getUserRulesPrompt()` serialization format
- `CLAUDE.md` — Project constraints: Biome linter, Prisma from apps/web, `createGenerateObject` requirement
- `.planning/phases/02-inbox-zero-recon/RECON.md` — Confirmed 10-rule production inventory, ECONOMY_LLM_* not set, prepaid credits

### Secondary (MEDIUM confidence — from planning artifacts cross-referenced with code)
- `.planning/phases/03-classification-engine/03-CONTEXT.md` — All decisions
- `.planning/REQUIREMENTS.md` — CLASS-01 through CLASS-08
- `.planning/STATE.md` — Current project position and blockers

---

## Metadata

**Confidence breakdown:**
- Zod schema changes: HIGH — read exact current schema from file
- Escalation pattern: HIGH — read exact code structure; pattern is clear
- Rule seeding: HIGH — no seed scripts exist; upsert approach verified against schema constraints
- Conversation rule filter: HIGH — traced through prepareRulesWithMetaRule and filterConversationStatusRules
- DIGEST premium check: MEDIUM — code confirmed but SSM value not verified
- Haiku model name: LOW — assumed from CONTEXT.md D-13; must verify at docs.anthropic.com

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable codebase; model names may change faster)

---

## RESEARCH COMPLETE