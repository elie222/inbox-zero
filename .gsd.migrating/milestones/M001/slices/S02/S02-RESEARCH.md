# Phase 2: Inbox Zero Recon - Research

**Researched:** 2026-04-27
**Domain:** Inbox Zero fork internals — classification pipeline, rules engine, AI integration, database schema
**Confidence:** HIGH (all findings sourced directly from codebase)

---

## Summary

This research is a direct audit of the Inbox Zero fork at `C:\Users\rebek\Documents\inbox-zero-rebekah`. Every finding is sourced from reading actual source files. No assumptions are made about behavior that was not confirmed in code.

The fork is a Next.js 16 (App Router) monorepo using Prisma + PostgreSQL, BullMQ/Upstash for background jobs, and Vercel AI SDK for LLM calls. It uses Better Auth (not NextAuth) despite keeping `NEXTAUTH_SECRET` for backwards compatibility. The LLM layer is provider-agnostic and configured entirely through environment variables; the fork has `DEFAULT_LLM_PROVIDER=anthropic` set, meaning `claude-sonnet-4-6` is the default model used for all classification today.

The existing classification system is **rule-first then AI**. It does not have the three-tier Haiku/Sonnet escalation yet — it makes one LLM call per email using whatever the default model is. This is the central cost problem Phase 3 will fix. The digest system is fully plumbed: rules can have a `DIGEST` action type that queues items into `DigestItem`, and a separate cron/queue sends the digest email via React Email + Resend. There is already a `ClassificationFeedback` table and a label-change learning loop.

**Primary recommendation:** Recon output is a set of keep/replace/extend decisions per component. All six decisions are documented below with rationale. No new code is needed in this phase — it is documentation-only.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RECON-01 | Map classification pipeline — inputs, outputs, prompts, confidence scoring | See Classification Pipeline section below |
| RECON-02 | Map rules engine — storage, evaluation, application | See Rules Engine section below |
| RECON-03 | Map AI integration — models, endpoints, prompts | See AI Integration section below |
| RECON-04 | Map database schema — tables relevant to classification and digests | See Database Schema section below |
| RECON-05 | Write keep/replace/extend decision for each major component | See Component Decisions section below |
| RECON-06 | Calculate projected cost: current vs. proposed three-tier architecture | See Cost Analysis section below |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email receipt / webhook | API (Next.js route handler) | Background (after()) | PubSub delivers to `/api/google/webhook`; processing deferred via `after()` |
| Rule matching (static) | API (synchronous) | — | Regex/string match runs in-process before any LLM call |
| Rule matching (AI) | API (LLM call) | — | `aiChooseRule` sends structured-output request to configured model |
| Learned patterns | API (DB lookup) | — | `Group`/`GroupItem` rows queried as a fast pre-filter before AI |
| Classification feedback | Database | API | Label-add/remove events stored in `ClassificationFeedback`; injected into next AI prompt |
| Digest item queuing | API (action handler) | Database | `digest()` action enqueues to `DigestItem` via `enqueueDigestItem` |
| Digest email sending | Background (cron / BullMQ) | Email (Resend) | `/api/resend/digest` or queue job; renders via React Email |
| AI summarization (digest) | API (LLM call) | — | `aiSummarizeEmailForDigest` uses economy model |
| Rules CRUD | API + Database | — | `utils/rule/rule.ts` handles CRUD; stored in `Rule` + `Action` tables |

---

## Classification Pipeline (RECON-01)

### Entry point

```
Google PubSub → POST /api/google/webhook
  → token verification (GOOGLE_PUBSUB_VERIFICATION_TOKEN)
  → getWebhookEmailAccount() — load account from DB
  → rate-limit check (skip if Gmail rate-limited)
  → after() — defer to background to avoid PubSub timeout
    → processHistoryForUser()
      → getHistory() — Gmail API call to get changed messageIds
      → for each historyItem → processHistoryItem()
        → LABEL_REMOVED → handleLabelRemovedEvent() → saveClassificationFeedback()
        → LABEL_ADDED → handleLabelAddedEvent() → saveClassificationFeedback()
        → MESSAGE_ADDED → markMessageAsProcessing() → processHistoryItemShared()
          → fetchMessage() → runRules()
```

**Key files:**
- `apps/web/app/api/google/webhook/route.ts` — entry point
- `apps/web/app/api/google/webhook/process-history.ts` — history fetch loop
- `apps/web/app/api/google/webhook/process-history-item.ts` — event dispatch
- `apps/web/utils/ai/choose-rule/run-rules.ts` — rule orchestration
- `apps/web/utils/ai/choose-rule/match-rules.ts` — matching logic

### Inputs to classification

Each email passes through `runRules()` as a `ParsedMessage` containing:
- `headers.from`, `headers.to`, `headers.subject`, `headers.date`
- `textPlain` (body text)
- `listUnsubscribe` (header presence signaled to AI)
- `threadId`, `messageId`, `internalDate`

### Matching logic (ordered)

1. **Cold email check first** — `isColdEmail()` called before all other rules; if cold, returns immediately.
2. **For each remaining rule:**
   a. **Learned patterns (Groups)** — `matchesGroupRule()` checks `GroupItem` rows (FROM, SUBJECT, BODY) via regex. If matched, short-circuits: no AI call for this rule.
   b. **Static conditions** — `matchesStaticRule()` regex-tests `from`, `to`, `subject`, `body` fields. Supports `*` wildcards and pipe/comma OR syntax for from/to.
   c. **AND/OR logic** — `conditionalOperator` on each Rule. Static match + AI condition with AND means both must pass; with OR, either suffices.
3. **AI call** — only if `potentialAiMatches.length > 0` AND no learned pattern already matched. Calls `aiChooseRule()`.
4. **Conversation tracking** — separate meta-rule synthesized from any `systemType` conversation rules; resolved after main matching.

### AI prompt structure (rule selection)

Single-rule mode (default when `multiRuleSelectionEnabled = false`):

```
SYSTEM:
  "You are an AI assistant that helps people manage their emails."
  <instructions> — prioritization rules (specific > catch-all > noMatchFound)
  <guidelines> — exclusion behavior, specificity, List-Unsubscribe metadata hint
  getUserRulesPrompt({ rules }) — serialized rule names + instructions
  formatClassificationFeedback() — up to 10 past label-add/remove events for this sender
  getUserInfoPrompt({ emailAccount }) — user name/about/role/writing style

PROMPT:
  "Select a rule to apply to this email that was sent to me:"
  <email>stringifyEmail(email, 500)</email>
  + List-Unsubscribe note if present

SCHEMA (Zod):
  { reasoning: string, ruleName: string | null, noMatchFound: boolean }
```

Multi-rule mode (`multiRuleSelectionEnabled = true`):
- Same structure but schema returns `matchedRules: [{ ruleName, isPrimary }][]`

**Confidence scoring:** There is NO confidence score stored per classification in the current codebase. `ExecutedRule.reason` stores the AI's text reasoning, and `ExecutedRule.matchMetadata` stores `MatchReason[]` (STATIC, AI, LEARNED_PATTERN, PRESET). There is no numeric score. This is a gap Phase 3 must fill.

### Outputs

For each matched rule:
1. `getActionItemsWithAiArgs()` — second AI call to fill in action parameters (label name, draft content, etc.) if the action has template variables
2. `executeAct()` — performs Gmail API calls (archive, label, reply, etc.)
3. `prisma.executedRule.create()` — writes `ExecutedRule` + `ExecutedAction` records
4. For `ActionType.DIGEST` actions → `enqueueDigestItem()` → writes `DigestItem`

---

## Rules Engine (RECON-02)

### Storage

Rules are stored in Postgres across three tables:

**`Rule`** — one row per rule:
- `id`, `name`, `enabled`, `emailAccountId`
- `instructions` — AI instruction text (can be null for purely static rules)
- `from`, `to`, `subject`, `body` — static regex fields (null = not set)
- `conditionalOperator` — `AND` | `OR`
- `groupId` — FK to learned pattern Group (null = no learned patterns)
- `systemType` — `SystemType` enum (null for user-created rules): `TO_REPLY`, `FYI`, `AWAITING_REPLY`, `ACTIONED`, `COLD_EMAIL`, `NEWSLETTER`, `MARKETING`, `CALENDAR`, `RECEIPT`, `NOTIFICATION`
- `runOnThreads` — whether to re-evaluate replies in the same thread
- `promptText` — natural-language description for prompt generation

**`Action`** — one row per action per rule:
- `type` — `ActionType` enum: `ARCHIVE`, `LABEL`, `REPLY`, `SEND_EMAIL`, `FORWARD`, `DRAFT_EMAIL`, `DIGEST`, `MOVE_FOLDER`, `MARK_SPAM`, `MARK_READ`, `CALL_WEBHOOK`, etc.
- `label`, `labelId`, `subject`, `content`, `to`, `cc`, `bcc`, `delayInMinutes` — action parameters
- `ruleId` FK

**`Group` / `GroupItem`** — learned sender patterns attached to rules:
- `GroupItem.type` — `FROM` | `SUBJECT` | `BODY`
- `GroupItem.value` — e.g., `@amazon.com`, `Receipt from`
- `GroupItem.exclude` — true = exclusion pattern
- `GroupItem.source` — `AI` | `USER` | `LABEL_REMOVED` | `LABEL_ADDED`

### Evaluation

Evaluation happens in `match-rules.ts` inside `findPotentialMatchingRules()`:

1. For rules with a `groupId`, lazy-load all `Group`s for the account, then `findMatchingGroup()` — O(n) scan of GroupItems.
2. Static evaluation: `matchesStaticRule()` — regex test on `from`, `to`, `subject`, `body` fields of the message.
3. AND/OR logic per rule via `conditionalOperator`.
4. If only AI conditions remain, rule goes to `potentialAiMatches[]`.
5. If any learned pattern match found → skip all potentialAiMatches (optimization: learned patterns trusted over AI).

### Application

After matching, `executeMatchedRule()`:
1. Calls `getActionItemsWithAiArgs()` to fill template variables via a second LLM call.
2. Splits actions into `immediateActions` and `delayedActions` (by `delayInMinutes`).
3. Writes `ExecutedRule` + `ExecutedAction` records atomically.
4. Calls `executeAct()` for immediate actions.
5. Calls `scheduleDelayedActions()` via BullMQ for delayed actions.

---

## AI Integration (RECON-03)

### Model tiers

The LLM layer (`utils/llms/model.ts`) supports five model type slots:

| Slot | Env vars | Purpose in codebase |
|------|----------|---------------------|
| `default` | `DEFAULT_LLM_PROVIDER`, `DEFAULT_LLM_MODEL` | Rule selection (`aiChooseRule`), conversation status, most AI tasks |
| `economy` | `ECONOMY_LLM_PROVIDER`, `ECONOMY_LLM_MODEL` | Email summarization for digest (`aiSummarizeEmailForDigest`), bulk tasks |
| `nano` | `NANO_LLM_PROVIDER`, `NANO_LLM_MODEL` | High-volume low-stakes tasks; falls back to economy |
| `chat` | `CHAT_LLM_PROVIDER`, `CHAT_LLM_MODEL` | Conversational assistant |
| `draft` | `DRAFT_LLM_PROVIDER`, `DRAFT_LLM_MODEL` | Draft reply generation |

**Fork configuration:** `DEFAULT_LLM_PROVIDER=anthropic` → resolves to `claude-sonnet-4-6`. No `ECONOMY_LLM_*` vars are set based on CLAUDE.md, so economy tasks fall back to the default (Sonnet) — this is the cost problem.

### AI call sites relevant to classification

| File | Function | Model slot | Purpose |
|------|----------|-----------|---------|
| `utils/ai/choose-rule/ai-choose-rule.ts` | `aiChooseRule` | `default` (Sonnet) | Picks which Rule to apply to an email |
| `utils/ai/choose-rule/choose-args.ts` | `getActionItemsWithAiArgs` | `default` | Fills action template variables |
| `utils/ai/digest/summarize-email-for-digest.ts` | `aiSummarizeEmailForDigest` | `economy` (= Sonnet) | Summarizes email for digest |
| `utils/cold-email/is-cold-email.ts` | `isColdEmail` | `default` | Cold email classification (separate from rule selection) |
| `utils/reply-tracker/generate-draft.ts` | draft generation | `draft` | Draft replies |
| `utils/ai/categorize-sender/ai-categorize-senders.ts` | bulk categorization | `economy` | Sender categorization |

### SDK and prompt hardening

All LLM calls go through `createGenerateObject()` from `utils/llms/index.ts`. This wrapper:
- Applies prompt hardening (`promptHardening: { trust: "untrusted", level: "full" | "compact" }`) — prompt injection defense
- Uses Vercel AI SDK `generateObject()` with Zod schemas for structured output
- Logs token usage

### Endpoints that call AI

No dedicated `/api/ai/classify` endpoint exists. Classification happens inline during webhook processing. The AI is called synchronously within the background `after()` task.

The `apps/web/app/api/ai/` directory contains specialized AI endpoints (analyze-sender-pattern, drafts, etc.) but classification itself is not a discrete HTTP endpoint — it is embedded in the webhook flow.

---

## Database Schema (RECON-04)

### Tables relevant to classification

| Table | Columns | Role |
|-------|---------|------|
| `Rule` | `id`, `name`, `enabled`, `emailAccountId`, `instructions`, `from`, `to`, `subject`, `body`, `conditionalOperator`, `groupId`, `systemType`, `runOnThreads`, `promptText` | Defines what to match and how |
| `Action` | `id`, `type` (ActionType enum), `ruleId`, `emailAccountId`, `label`, `labelId`, `content`, `subject`, `delayInMinutes` | What to do when a rule matches |
| `ExecutedRule` | `id`, `threadId`, `messageId`, `status` (APPLIED/APPLYING/SKIPPED/ERROR), `automated`, `reason`, `matchMetadata` (JSON), `ruleId`, `emailAccountId`, `createdAt` | Audit trail of every classification |
| `ExecutedAction` | `id`, `type`, `executedRuleId`, `label`, `labelId`, `content`, `draftId` | Audit trail of every action taken |
| `Group` | `id`, `name`, `emailAccountId` | Container for learned patterns |
| `GroupItem` | `id`, `groupId`, `type` (FROM/SUBJECT/BODY), `value`, `exclude`, `source` | Individual learned pattern entries |
| `ClassificationFeedback` | `id`, `sender`, `eventType` (LABEL_ADDED/LABEL_REMOVED), `ruleId`, `emailAccountId`, `threadId`, `messageId` | Label-change signals injected back into prompts |
| `Newsletter` | `id`, `email`, `name`, `status`, `patternAnalyzed`, `emailAccountId`, `categoryId` | Sender metadata (misnamed; covers all auto-categorized senders) |

### Tables relevant to digests

| Table | Columns | Role |
|-------|---------|------|
| `Digest` | `id`, `emailAccountId`, `status` (PENDING/PROCESSING/SENT/FAILED), `sentAt`, `createdAt` | Container for a batch of digest items |
| `DigestItem` | `id`, `messageId`, `threadId`, `content` (JSON, redacted after send), `digestId`, `actionId` | Individual email summarized for digest |
| `Schedule` | `id`, `emailAccountId`, `daysOfWeek` (bitmask), `timeOfDay` (DateTime), `intervalDays`, `occurrences`, `lastOccurrenceAt`, `nextOccurrenceAt` | When to send the digest |

### ExecutedRule.matchMetadata structure (JSON)

```typescript
// MatchReason[]
type MatchReason =
  | { type: "STATIC" }
  | { type: "AI" }
  | { type: "PRESET"; systemType: SystemType }
  | { type: "LEARNED_PATTERN"; groupItem: GroupItem; group: Group }
```

**Note:** No numeric confidence score exists anywhere in the schema. The `reason` field is free text from the AI. Phase 3 must add a `confidenceScore Float?` column to `ExecutedRule` (or a new `ClassificationResult` table).

### DigestItem.content structure (JSON)

```typescript
// storedDigestContentSchema (from apps/web/app/api/resend/digest/validation.ts)
{ content: string }  // AI-summarized text; redacted to "[REDACTED]" after send
```

---

## Component Decisions (RECON-05)

### Decision 1: Webhook Entry Point (`/api/google/webhook`)

**Decision: KEEP**

The webhook, token verification, rate-limit guard, and `after()` deferral pattern are correct and production-ready. No changes needed here for the classification engine. The webhook is provider-agnostic (also handles Outlook via a parallel path).

### Decision 2: `match-rules.ts` — Static and Learned Pattern Matching

**Decision: KEEP + EXTEND**

The static regex matching and learned-pattern (Group) short-circuit are sound and cost-free. These should be preserved and promoted to "Tier 1" in the three-tier architecture. The extension needed is: run explicit user rules from the new Rules UI as the highest-priority tier before learned patterns. Currently there is no ordering between user-defined static rules and system rules — Phase 3 must add explicit priority ordering.

### Decision 3: `ai-choose-rule.ts` — LLM Rule Selection

**Decision: REPLACE (the model selection), KEEP (the prompt structure)**

The prompt structure (system instructions + user rules + classification feedback + email content → structured JSON output) is well-designed and should be kept. What must change:
- Replace `getModel(emailAccount.user, "default")` with tiered escalation: call Haiku first; only escalate to Sonnet if confidence is low or Haiku returns `noMatchFound = true`.
- The schema needs a `confidenceScore: number` field added so Phase 3 can store it.
- Currently multi-rule mode (`multiRuleSelectionEnabled`) is a per-account toggle defaulting to `false`. For single-tenant use, set this explicitly.

### Decision 4: `actions.ts` — DIGEST Action

**Decision: KEEP + EXTEND**

The `DIGEST` action type (`enqueueDigestItem`) is correct infrastructure. The extension needed is the Uncertain/Urgent classification categories — emails classified as Urgent or Uncertain need to stay in inbox AND get queued to digest. Currently, digest is only triggered when a matching Rule has a `DIGEST` action. Phase 3 must ensure the eight target categories each have a corresponding Rule with the right actions (LABEL + ARCHIVE for most; LABEL-only for Urgent/Uncertain; DIGEST for all items going into morning summary).

### Decision 5: Digest Send Pipeline (`/api/resend/digest`, `send-digest.ts`)

**Decision: KEEP + EXTEND**

The digest rendering and send pipeline (React Email + Resend, Schedule table, PENDING→PROCESSING→SENT state machine) is correct. Extensions needed for Phase 4:
- Add thumbs-up/down feedback links per DigestItem (DIGEST-07)
- Add Urgent and Uncertain sections (currently digest groups by Rule name — these would just be two more rule-named sections)
- The daily 6-7am constraint requires the `Schedule` row's `timeOfDay` to be set correctly via the API

### Decision 6: `ClassificationFeedback` + Label-Change Learning

**Decision: KEEP + EXTEND**

The label-add/remove learning loop is already implemented and feeds back into AI prompts (up to 10 items per sender). This is a strong foundation for the Feedback System (Phase 6). No replacement needed. Extension: Phase 6 will add thumbs-up/down feedback from the digest email, which will need a new event type or a companion table since these are explicit votes rather than implicit label changes.

---

## Cost Analysis (RECON-06)

### Current architecture cost estimate

**Inputs:**
- Single user: `rebekah@trueocean.com`
- Typical personal email volume: 20-50 emails/day (estimate for low-volume personal account) [ASSUMED]
- Model: `claude-sonnet-4-6` (Anthropic direct)
- Pricing as of 2026-04: claude-sonnet-4-6: $3.00/MTok input, $15.00/MTok output [ASSUMED — verify at anthropic.com/pricing]

**Per-email AI calls today:**
1. `aiChooseRule()` — rule selection: ~500-800 tokens input (system + rules list + email), ~50-100 tokens output
2. `getActionItemsWithAiArgs()` — args filling (only if template variables needed): ~300-500 tokens input, ~50 tokens output

Assume 1.5 AI calls per email average (some emails skip args step).

**Conservative estimate:**
- Input per email: ~900 tokens average
- Output per email: ~100 tokens average
- Daily: 35 emails × 1 call = ~31,500 input tokens, ~3,500 output tokens
- Monthly: 945K input tokens, 105K output tokens
- Cost: (0.945 × $3.00) + (0.105 × $15.00) = $2.84 + $1.58 = **~$4.42/month** (Sonnet only)

Plus digest summarization:
- ~35 emails/day × 30 days = 1,050 emails summarized/month via economy model (currently also Sonnet)
- ~400 tokens input, ~100 tokens output per summary
- Monthly: 420K input, 105K output = (0.42 × $3.00) + (0.105 × $15.00) = $1.26 + $1.58 = **~$2.84/month**

**Total current estimate: ~$7.26/month** [ASSUMED — based on estimated email volume and token counts, not measured]

### Proposed three-tier architecture cost

**Tier 1: Explicit rules (free)**
- All emails from known senders in `GroupItem` or static `Rule.from/subject` fields → zero AI cost
- Estimate: 60-70% of emails matched here after a few weeks of learning [ASSUMED]
- With 35 emails/day, ~22 caught by rules → 13 require AI

**Tier 2: Claude Haiku for uncertain cases**
- `claude-haiku-3-5`: $0.80/MTok input, $4.00/MTok output (Anthropic pricing) [ASSUMED — verify]
- 13 emails/day × 30 days = 390 emails/month
- ~900 tokens input, ~100 tokens output each
- Cost: (0.351 × $0.80) + (0.039 × $4.00) = $0.28 + $0.16 = **~$0.44/month**

**Tier 3: Claude Sonnet for hard cases only**
- Escalation threshold: Haiku confidence below threshold or `noMatchFound = true`
- Estimate: 10-15% of Haiku cases escalate (~1-2 emails/day)
- 45 emails/month via Sonnet
- Cost: (0.0405 × $3.00) + (0.0045 × $15.00) = $0.12 + $0.07 = **~$0.19/month**

**Digest summarization (economy model = Haiku)**
- Move `aiSummarizeEmailForDigest` to use Haiku: 1,050 summaries × 500 tokens = 525K tokens
- Cost: (0.525 × $0.80) + (0.105 × $4.00) = $0.42 + $0.42 = **~$0.84/month**

**Daily digest narrative (Sonnet, once per day)**
- 30 calls/month × ~2,000 tokens input, ~500 tokens output
- Cost: (0.06 × $3.00) + (0.015 × $15.00) = $0.18 + $0.23 = **~$0.41/month**

**Total proposed estimate: ~$1.88/month** [ASSUMED — all numbers are estimates pending real usage measurement]

### Summary table

| Scenario | Monthly AI Cost | Savings vs. Current |
|----------|----------------|---------------------|
| Current (all Sonnet) | ~$7.26 | — |
| Proposed three-tier | ~$1.88 | ~$5.38/month (74%) |
| Budget ceiling | $10.00 additional | Comfortably under ceiling |

**Key uncertainty:** Email volume and tier-1 hit rate are both estimated. The cost calculation should be revisited after Phase 3 is live and real token counts are available from Anthropic's usage dashboard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parser | `createGenerateObject()` (already in codebase) | Prompt hardening, retry, logging all wired |
| Rule regex matching | New matcher | `matchesStaticRule()` (already in codebase) | Handles wildcards, pipe-OR, display-name matching |
| Model selection | New env-var reader | `getModel(user, modelType)` (already in codebase) | Already supports all providers; just set ECONOMY_LLM_* vars |
| Email digest queuing | New queue | `ActionType.DIGEST` + `enqueueDigestItem` (already in codebase) | Infrastructure is correct, just needs right rules configured |
| Label learning | Custom feedback table | `ClassificationFeedback` + `GroupItem` (already in codebase) | Both systems are live and feeding prompts |

---

## Common Pitfalls

### Pitfall 1: No numeric confidence score exists today
**What goes wrong:** Phase 3 plans to store confidence scores, but `ExecutedRule` has no `confidenceScore` column. Any plan that references "read the confidence score from the DB" will fail.
**Why it happens:** The existing system uses text reasoning, not numeric scores.
**How to avoid:** Phase 3 must include a migration adding `confidenceScore Float?` to `ExecutedRule` (or a new `ClassificationResult` table).

### Pitfall 2: Economy model falls back to Sonnet if `ECONOMY_LLM_*` vars are unset
**What goes wrong:** `aiSummarizeEmailForDigest` calls `getModel(emailAccount.user, "economy")` — but `selectEconomyModel()` falls back to `selectDefaultModel()` if `ECONOMY_LLM_PROVIDER` is not set. Current SSM likely has no `ECONOMY_LLM_*` vars.
**Why it happens:** The model tier config is all-or-nothing per tier.
**How to avoid:** Phase 3 must set `ECONOMY_LLM_PROVIDER=anthropic` and `ECONOMY_LLM_MODEL=claude-haiku-3-5` in SSM Parameter Store alongside `NANO_LLM_PROVIDER` and `NANO_LLM_MODEL` for bulk tasks.

### Pitfall 3: DIGEST action requires a specific Action row on the Rule — it is not automatic
**What goes wrong:** An email classified into a category will only appear in the digest if the matched Rule has an `Action` row of type `DIGEST`. A Rule that just does `ARCHIVE` + `LABEL` will not create a DigestItem.
**Why it happens:** Digest is opt-in per rule, not a global behavior.
**How to avoid:** Phase 3 must ensure each of the eight classification rules has a `DIGEST` action attached where appropriate.

### Pitfall 4: `multiRuleSelectionEnabled` defaults to false; single-rule mode returns only one rule
**What goes wrong:** A single email that should be both "Urgent" and "Receipts" will only get one classification.
**Why it happens:** `multiRuleSelectionEnabled = false` is the default; single-rule mode schema returns a single `ruleName`.
**How to avoid:** For our eight-category taxonomy, each email should map to exactly one category — single-rule mode is correct and intentional.

### Pitfall 5: DigestItem.content is redacted to `[REDACTED]` after digest send
**What goes wrong:** Any code that tries to re-read digest item content after the digest was sent will find `[REDACTED]`.
**Why it happens:** Privacy-by-design in `apps/web/app/api/resend/digest/route.ts` — content is redacted post-send.
**How to avoid:** Feedback links in the digest email must encode enough state in the URL token to identify the email without needing to re-read DigestItem.content.

### Pitfall 6: Bulk email processing through the UI is extremely expensive
**What goes wrong:** If Phase 7 (Backlog Triage) accidentally routes through the existing webhook + runRules path at scale, it costs ~$1.50/minute.
**Why it happens:** Documented in CLAUDE.md: "Do not run bulk email processing through the Inbox Zero UI — it processes emails through the LLM."
**How to avoid:** Phase 7 must use the Claude Batch API directly, bypassing runRules entirely.

---

## Environment Availability

Step 2.6: Environment Availability section is scoped to the production EC2 instance. Since this is a recon phase (documentation only), no new external dependencies are introduced. All tools used are already confirmed operational (Docker, PostgreSQL, Redis/Upstash, Resend, Anthropic API) per Phase 1 completion.

---

## Validation Architecture

This phase produces only documentation files (RECON.md). No code is written. No automated tests apply.

**Phase gate:** The planner should verify each of the six RECON requirements is addressed in the output RECON.md document before marking Phase 2 complete.

---

## Sources

### Primary (HIGH confidence — sourced from codebase)
- `apps/web/app/api/google/webhook/route.ts` — webhook entry point
- `apps/web/app/api/google/webhook/process-history.ts` — history processing loop
- `apps/web/app/api/google/webhook/process-history-item.ts` — event dispatch
- `apps/web/utils/ai/choose-rule/run-rules.ts` — rule orchestration
- `apps/web/utils/ai/choose-rule/match-rules.ts` — matching logic (static, learned, AI)
- `apps/web/utils/ai/choose-rule/ai-choose-rule.ts` — LLM prompt construction and response parsing
- `apps/web/utils/ai/choose-rule/choose-args.ts` — action argument filling
- `apps/web/utils/ai/digest/summarize-email-for-digest.ts` — digest summarization prompt
- `apps/web/utils/ai/actions.ts` — action execution (including DIGEST action)
- `apps/web/utils/llms/model.ts` — model tier selection logic
- `apps/web/utils/rule/classification-feedback.ts` — feedback storage and retrieval
- `apps/web/prisma/schema.prisma` — full database schema
- `apps/web/app/api/resend/digest/route.ts` — digest send pipeline
- `apps/web/utils/digest/send-digest.ts` — digest send orchestration
- `apps/web/env.ts` — environment variable schema
- `CLAUDE.md` — fork context and architectural notes

### Tertiary (LOW confidence — estimated, not measured)
- Email volume estimates (20-50/day) [ASSUMED]
- Token count estimates per classification call [ASSUMED]
- Anthropic pricing as of 2026-04 [ASSUMED — verify at anthropic.com/pricing before Phase 3 planning]
- Tier-1 hit rate estimate (60-70%) [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Personal email volume is 20-50 emails/day | Cost Analysis | Could be 100-200+/day; cost estimates scale proportionally |
| A2 | ~900 tokens input per classification call | Cost Analysis | If prompts are larger (many rules), costs are higher |
| A3 | claude-haiku-3-5 priced at $0.80/$4.00 per MTok | Cost Analysis | If pricing changed, three-tier savings math changes |
| A4 | claude-sonnet-4-6 priced at $3.00/$15.00 per MTok | Cost Analysis | If pricing changed, current cost estimate changes |
| A5 | Tier-1 rules catch 60-70% of emails after learning period | Cost Analysis | If lower, Haiku call rate is higher; still within $10/mo ceiling |
| A6 | No `ECONOMY_LLM_*` vars set in production SSM | Pitfalls | If set, economy model already cheaper; verify before Phase 3 |

---

## Open Questions

1. **Is the production Anthropic API key a standard pay-as-you-go key or a prepaid credits key?**
   - What we know: ANTHROPIC_API_KEY is set in SSM
   - What's unclear: Whether there is a spending limit configured in the Anthropic console
   - Recommendation: Confirm before Phase 3 to ensure no hard limit will block classification

2. **How many Rules currently exist in production for rebekah@trueocean.com?**
   - What we know: Rules are user-created and stored in Postgres
   - What's unclear: Whether any rules have been created via the UI; affects prompt token count
   - Recommendation: Run `SELECT count(*) FROM "Rule" WHERE "emailAccountId" = ...` on production DB during Phase 2 plan execution

3. **Is `ECONOMY_LLM_PROVIDER` set in production SSM?**
   - What we know: It is not mentioned in CLAUDE.md or Phase 1 plans
   - What's unclear: Whether it was set during initial setup
   - Recommendation: Check SSM during Phase 2 plan execution: `aws ssm get-parameter --name /inbox-zero/ECONOMY_LLM_PROVIDER`

---

## Metadata

**Confidence breakdown:**
- Classification pipeline: HIGH — sourced from actual route and utility files
- Rules engine: HIGH — sourced from schema + match-rules.ts
- AI integration: HIGH — sourced from model.ts and ai-choose-rule.ts
- Database schema: HIGH — sourced from prisma/schema.prisma
- Cost analysis: LOW — email volume and token counts are estimated, not measured
- Keep/replace/extend decisions: MEDIUM — technically grounded but rationale includes judgment calls

**Research date:** 2026-04-27
**Valid until:** 2026-06-27 (stable codebase; upstream Inbox Zero changes could affect after major upstream merges)