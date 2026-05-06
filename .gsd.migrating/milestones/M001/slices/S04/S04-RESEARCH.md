# Phase 4: Daily Digest - Research

**Researched:** 2026-05-04
**Domain:** Cron-driven scheduled email + batched LLM summarization + transactional email rendering
**Confidence:** HIGH

## Summary

Phase 4 wires the locked `digest-v2.tsx` visual contract to real `DigestItem` rows, generates a single Sonnet narrative + cluster summary call per send, and delivers it daily at 9am ET via a new `/api/cron/digest` endpoint. The architecture is straightforward — every primitive already exists in the fork (DIGEST action queueing, BullMQ-equivalent QStash routing, Resend send pipeline, Bearer-CRON_SECRET auth, `createGenerateObject` for JSON-mode Sonnet calls). Two non-trivial gaps must be filled by plan-phase: (1) **no scheduler currently runs in the self-hosted deployment** — `vercel.json` defines crons but EC2/Docker doesn't honor them and `QSTASH_TOKEN` is not in the docker-compose env passthrough, so `/api/resend/digest/all` has never fired; (2) the existing `route.ts` send pipeline is per-account fan-out scaffolding for the multi-tenant SaaS upstream and should be replaced with a single-tenant 9am-ET cron, not adapted.

The redesigned digest uses one batched Sonnet call processing 30–50 message bodies producing four output fields (narrative greeting, narrative body, per-Urgent/Uncertain summaries, per-cluster auto-filed rows). At sonnet-4-6 pricing of $3/$15 per million tokens, projected monthly cost is $1.80–$5.40 — comfortably under the $10/mo ceiling.

**Primary recommendation:** Build a fresh `/api/cron/digest` endpoint that ignores the existing per-account `Schedule`/`digestSendEmail` machinery, calls a new batched-Sonnet helper (`utils/ai/digest/generate-digest-content.ts`) producing the typed `DigestV2Props` shape directly, and uses `sendDigestEmail` from `@inboxzero/resend` with the new template. Do NOT extend the existing `apps/web/app/api/resend/digest/route.ts` — it carries multi-tenant `Schedule` semantics that fight the single-tenant 9am-ET decision.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Section Structure & Narrative**
- **D-01: Daily-briefing-first.** Calm-morning-read shaped, not action-queue. Sonnet conversational paragraph on top; sections follow narrative-implied order (Urgent → Uncertain → auto-filed cool-down).
- **D-02: Personal-assistant voice.** Conversational, lightly summarized, names the one or two things that caught Sonnet's eye.
- **D-03: Voice has personality.** Humor, light sarcasm, holiday/observance refs (`Today is {date}` in the prompt). Real-time news deferred — no external API.
- **D-04: Tone guardrails.** Urgent renders professionally — no jokes. Auto-filed and Uncertain can be playful. **Hard guardrail:** Sonnet must drop humor entirely if any item touches grief, serious illness, financial distress, legal threats, or family emergencies. Encode in system prompt.
- **D-05: Per-item Urgent and Uncertain.** Each renders as own card with full subject + sender + Sonnet-written summary. No roll-up.
- **D-06: Auto-filed sections roll up by sender or topic.** Sonnet clusters DigestItems within each auto-filed section (Receipts, Newsletters, Marketing, Notifications) along same-sender and cross-sender topic axes. One cluster row per cluster, NOT per item. Cluster-row summary is Sonnet-generated (subject lines are misleading for receipts/newsletters/marketing).
- **D-07: Subject line format.** `<bold cluster label>: <one-sentence summary>`. Label is the noun ("Starbucks", "Fuel", "Tech & politics"); summary is the action/observation.
- **D-08: Section ordering is fixed.** Narrative → Urgent → Uncertain → Auto-filed (Receipts → Newsletters → Marketing → Notifications). Order is by warm-to-cool color hierarchy (red → amber → green → blue → purple → pink).
- **D-09: Visual contract is `digest-v2.tsx`.** TypeScript React Email component is locked. Plan-phase wires real DigestItem data into this component's typed props. Original `digest.tsx` left untouched as reference.

**Uncertain Item UX**
- **D-10: Single "Review in app →" link per Uncertain item.** No thumbs-up/down in email.
- **D-11: Review URL pattern.** `https://inbox.tdfurn.com/uncertain/{itemId}` — route lands in Phase 5; allowed to 404 in Phase 4.

**Cron Timing**
- **D-12: 9:00 AM Eastern, year-round.** Cron expression in `America/New_York` so DST is scheduler-handled. Single-tenant; not parameterized.
- **D-13: Window = since-last-successful-send, no cap.** Today's digest covers every un-SENT DigestItem regardless of elapsed time.
- **D-14: Idempotency policy.** Per-DigestItem SENT flag plus per-day `DigestSend` record keyed by date. Six-step transaction outlined in CONTEXT.md.
- **D-15: Subject line.** `Daily digest · {Day, Month D}`. Sender `Inbox Zero <inbox-digest@tdfurn.com>` (matches `RESEND_FROM_EMAIL`).

**Backfill**
- **D-16: Mark all 218 as SENT during deploy.** Single SQL: `UPDATE "Digest" SET status = 'SENT' WHERE status != 'SENT' AND createdAt < <deploy-timestamp>`. (See research note: it's `Digest.status` not `DigestItem.status`.)
- **D-17: Cutover acknowledgment.** No "we skipped 218 emails" email. Silent transition.

**Deals Reframing**
- **D-18: Deals = Marketing sub-cluster, not top-level section.** Sonnet's roll-up prompt for Marketing identifies promotional items and groups them into clusters labeled "Deals — outdoor", etc.
- **D-19: REQUIREMENTS DIGEST-03 reframe** to sub-cluster wording.

**Spec Follow-Ups**
- DIGEST-01: rewrite "between 6-7am" → "9:00 AM ET, since-last-send window".
- DIGEST-03: rewrite per D-19.
- DIGEST-05: rewrite to "Review in app deep-link per item; rich feedback deferred".
- DIGEST-07: descope from Phase 4. Move to Phase 6.

### Claude's Discretion

- DigestSend table column list beyond `(date, sentAt, messageId, status)` — useful additions: token count, item count, narrative-text snapshot.
- Failure visibility approach (logs vs. fallback alert email vs. Sentry). Probably logs-only for v1.
- Rewrite-in-place vs. new endpoint for `apps/web/app/api/resend/digest/route.ts`.
- Marketing rule routing: add DIGEST action vs. query by label vs. separate path.
- Investigate DigestItem creation gap (~12%) and decide fix-now vs. defer.
- Backfill mechanism: Prisma seed vs. one-shot SQL vs. deploy hook.

### Deferred Ideas (OUT OF SCOPE)

- Rich feedback handling on Uncertain items (Phase 5 + Phase 6).
- Restoring/replacing the Deals rule — Deals is a Sonnet sub-cluster only.
- Real-time news API in narrative.
- Multi-tenant scheduling.
- DIGEST-07 (record feedback without login from email click) — moved to Phase 6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (reframed per CONTEXT.md) | Research Support |
|----|---------------------------------------|------------------|
| DIGEST-01 | Daily digest sends to rebekah@trueocean.com at 9:00 AM ET, covering since-last-send window | `/api/cron/digest` endpoint + scheduler (gap detailed in §"Cron Scheduler in this Fork"); `hasCronSecret` Bearer auth pattern (`utils/cron.ts`); date helper in `utils/digest/format.ts` |
| DIGEST-02 | Digest contains Urgent items section with sender, subject, Sonnet summary (per-item card) | `digest-v2.tsx` `urgent: ActionItem[]` prop; query `DigestItem` JOIN `ExecutedAction` JOIN `ExecutedRule` JOIN `Rule WHERE name='Urgent'`; Sonnet batched-call writes `summary` per item |
| DIGEST-03 | Promotional items in Marketing section appear as Sonnet-detected sub-cluster prefixed `Deals — {topic}` (no separate section, no rule) | Sonnet system prompt directive embedded in clustering instructions; `digest-v2.tsx` `autoFiled[category=marketing].rows` carries the cluster |
| DIGEST-04 | Auto-filed roll-ups: Receipts, Newsletters, Marketing, Notifications with cluster rows by sender or topic | `digest-v2.tsx` `autoFiled: AutoFiledGroup[]` prop; `emailCount` + `clusterCount` computed; Sonnet outputs `rows: {label, summary}[]` |
| DIGEST-05 | Uncertain items have a single "Review in app →" deep-link per item; rich feedback deferred | `digest-v2.tsx` already renders link when `variant='uncertain'` and `reviewUrl` set; URL pattern `https://inbox.tdfurn.com/uncertain/{itemId}` |
| DIGEST-06 | Digest narrative is Sonnet-generated, once per day | Single batched call producing 4 fields; `getModel(user, "default")` returns Sonnet (DEFAULT_LLM_PROVIDER=anthropic, model claude-sonnet-4-6); `createGenerateObject` JSON-mode pattern (see `summarize-email-for-digest.ts`) |
| ~~DIGEST-07~~ | ~~Thumbs-up/down feedback recorded without login~~ | DESCOPED to Phase 6 per CONTEXT.md D-10. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **AI cost ceiling:** ≤ $10/mo additional. Phase 4 budget: $1.80–$5.40 per month projected. **Verified under ceiling.**
- **Three-tier model architecture is non-negotiable:** rules → Haiku → Sonnet sparingly. Phase 4 uses Sonnet (digest narrative is the canonical "sparingly" use case).
- **Cron auth pattern:** `Authorization: Bearer ${CRON_SECRET}` via `hasCronSecret(request)` from `utils/cron.ts`. Do NOT use `x-api-key`.
- **Prisma migrations:** Run from `apps/web` with `pnpm prisma migrate dev`. Build pipeline runs `prisma migrate deploy`.
- **Linter:** Biome (not ESLint). `pnpm lint`.
- **Worker pattern:** `apps/worker` polls Redis BullMQ → POSTs to `INTERNAL_API_URL/api/...` with `INTERNAL_API_KEY` header. In production, QStash can substitute via `QSTASH_TOKEN`.
- **Postgres access on prod:** `sudo docker exec inbox-zero-postgres psql -U inboxzero -d inboxzero` (memory note).
- **`EMAIL_ENCRYPT_SECRET`/`EMAIL_ENCRYPT_SALT` must never rotate.** Not relevant to digest, but flagged because `sendDigest` reads `emailAccount` rows that store encrypted tokens.
- **Better Auth (not NextAuth)** despite `NEXTAUTH_SECRET` env var name.
- **Verify before claiming resolved** (memory note): RESOLVED status in STATE.md has been wrong before — verify the delivered artifact (env in container, logs from running process), not source.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cron scheduling (fire 9am ET) | Scheduler (system cron / QStash) | API endpoint | Scheduler decides when; endpoint receives the trigger |
| HTTP entry point + auth | API / Backend (`/api/cron/digest`) | — | Standard Next.js App Router route; Bearer CRON_SECRET auth |
| Pending-item query + state machine | API / Backend (Prisma + Postgres) | — | Transactional reads/writes against `Digest`, `DigestItem`, new `DigestSend` |
| Gmail message body fetch | API / Backend (`createEmailProvider` → Gmail API) | — | Existing `getMessagesBatch` 100-at-a-time pattern with 2s sleep |
| Sonnet batched generation | API / Backend (`createGenerateObject` + Anthropic via Vercel AI SDK) | — | One call per send; JSON-mode structured output |
| Email rendering | Email package (`packages/resend/emails/digest-v2.tsx`) | — | React Email + Tailwind component; render to HTML at send time |
| Email send | API / Backend (`@inboxzero/resend.sendDigestEmail` → Resend API) | — | Already wired via `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Idempotency | API / Backend (Postgres `DigestSend` row + transaction) | — | Database is the source of truth for "did we send today" |
| Backfill | Database / Storage (one-shot SQL) | Deploy script | Migrates pre-existing rows; runs once at deploy |
| Failure visibility | API / Backend (logger + Sentry hooks already wired) | — | `captureException` already in cron routes |

## Standard Stack

### Core (already in fork — no new dependencies for Phase 4)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | per package.json | LLM call orchestration via `createGenerateObject` | `[VERIFIED: apps/web/utils/llms/index.ts:21]` Already used for every classification call; supports JSON-mode + zod schemas + automatic retry/repair |
| `@ai-sdk/anthropic` | per package.json | Anthropic provider for Sonnet/Haiku | `[VERIFIED: apps/web/utils/llms/model.ts:5]` Standard provider; `getModel(user, "default")` returns sonnet-4-6 |
| `zod` | per package.json | Output schema for Sonnet structured response | `[VERIFIED: apps/web/utils/ai/digest/summarize-email-for-digest.ts:1,12]` Standard pattern in this codebase |
| `@react-email/components` | per package.json | Email template primitives | `[VERIFIED: packages/resend/emails/digest-v2.tsx:1-11]` Already used; `digest-v2.tsx` is the locked contract |
| `resend` | per package.json | Email send API | `[VERIFIED: apps/web/utils/digest/send-digest.ts:2]` Already wired via `@inboxzero/resend` workspace package |
| `@prisma/client` | per package.json | Database access | `[VERIFIED: apps/web/utils/prisma.ts]` Standard ORM in this codebase |
| `date-fns` | per package.json (`date-fns/subDays` already imported) | Date math | `[VERIFIED: apps/web/app/api/resend/digest/all/route.ts:2]` In use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns-tz` (potential add) | n/a | America/New_York DST-aware math | Only if plan-phase needs to parse cron-time-relative dates in code (probably not — scheduler handles TZ) `[ASSUMED]` |
| `@upstash/qstash` | per package.json | QStash scheduling (potential cron host) | If plan-phase chooses QStash to host the 9am-ET schedule `[VERIFIED: apps/web/utils/qstash.ts:1]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sonnet single-shot batched call | Two Haiku calls (clustering + narrative) | Cheaper but Sonnet's training data is needed for personality/holiday refs (D-03) and grief/distress detection (D-04); Haiku is too thin for the conversational voice |
| QStash schedules | System crontab on EC2 | Crontab is simpler but `QSTASH_TOKEN` is already in env.ts and Upstash Redis is already running. `/api/resend/digest/all` is wired through QStash dispatch path (`enqueueBackgroundJob`). However: `QSTASH_TOKEN` is NOT in `deploy/docker-compose.yml` env passthrough — needs adding, OR use crontab. `[VERIFIED: deploy/docker-compose.yml]` |
| New `/api/cron/digest` endpoint | Reuse `/api/resend/digest` (POST) | New endpoint is cleaner — existing route is wired to per-account `Schedule` table semantics that don't apply single-tenant 9am-ET. Existing route also redacts items as `[REDACTED]` after send (line 361) which makes debugging hard. |

**Installation:** No new packages required for the primary path.

**Version verification (cost-relevant):**
- Sonnet 4.6 (`anthropic/claude-sonnet-4.6`): input `$3/MTok`, output `$15/MTok` `[VERIFIED: apps/web/utils/llms/pricing.generated.ts:42-46]`
- Haiku 4.5 (`anthropic/claude-haiku-4.5`): input `$1/MTok`, output `$5/MTok` `[VERIFIED: pricing.generated.ts:22-26]`

## Architecture Patterns

### System Architecture Diagram

```
                            9am ET daily
  ┌──────────────────┐         (scheduler — see §Cron Scheduler gap)
  │  Scheduler       │─────────────────────────┐
  │  (QStash schedule │                         │
  │   OR EC2 crontab) │                         │
  └──────────────────┘                         ▼
                                  ┌─────────────────────────┐
                                  │ POST /api/cron/digest    │
                                  │ Bearer ${CRON_SECRET}    │
                                  │ → hasCronSecret(req)     │
                                  └────────────┬────────────┘
                                               │
                  ┌────────────────────────────┼────────────────────────────────┐
                  ▼                            ▼                                ▼
        ┌──────────────────┐       ┌──────────────────────┐         ┌────────────────────┐
        │ Idempotency check│       │ Query un-SENT items  │         │ Mark items          │
        │ DigestSend.date  │       │ Digest WHERE status= │         │ status=PROCESSING   │
        │ already exists?  │       │   PENDING            │         │ (transactional)     │
        │   → 200 + skip   │       │ JOIN DigestItem      │         └─────────┬──────────┘
        └──────────────────┘       │ JOIN ExecutedAction  │                   │
                                   │ JOIN ExecutedRule    │                   │
                                   │ JOIN Rule (name)     │                   │
                                   └──────────┬───────────┘                   │
                                              │                               │
                                              ▼                               │
                              ┌──────────────────────────┐                   │
                              │ Gmail batch fetch         │                   │
                              │ getMessagesBatch(100/req) │                   │
                              │ + 2s sleep between batches│                   │
                              └────────────┬─────────────┘                   │
                                           │                                  │
                                           ▼                                  │
                          ┌────────────────────────────┐                     │
                          │ Bucket items by ruleName    │                     │
                          │ (Urgent / Uncertain /       │                     │
                          │  Receipts / Newsletters /   │                     │
                          │  Marketing / Notifications) │                     │
                          └────────────┬───────────────┘                     │
                                       │                                      │
                                       ▼                                      │
                  ┌─────────────────────────────────────────────┐             │
                  │ ONE Sonnet call (createGenerateObject)       │             │
                  │ Input: all message bodies + ruleName labels  │             │
                  │ Output (zod schema):                         │             │
                  │   { narrativeGreeting: string,               │             │
                  │     narrativeBody: string,                   │             │
                  │     urgent: [{ messageId, summary }],        │             │
                  │     uncertain: [{ messageId, summary }],     │             │
                  │     autoFiled: { receipts, newsletters,      │             │
                  │       marketing, notifications:              │             │
                  │       [{ label, summary, memberMessageIds }] │             │
                  │     } }                                      │             │
                  └────────────┬────────────────────────────────┘             │
                               │                                              │
                               ▼                                              │
                ┌─────────────────────────────────┐                          │
                │ Build DigestV2Props:              │                          │
                │  - merge sender/subject from      │                          │
                │    messageMap into Sonnet output  │                          │
                │  - compute emailCount/clusterCount│                          │
                │  - generate reviewUrl per         │                          │
                │    Uncertain                      │                          │
                └────────────┬────────────────────┘                          │
                             │                                                │
                             ▼                                                │
                ┌─────────────────────────────────┐                          │
                │ render(<DigestV2 ... />)         │                          │
                │ via @react-email/components      │                          │
                └────────────┬────────────────────┘                          │
                             │                                                │
                             ▼                                                │
                ┌─────────────────────────────────┐                          │
                │ Resend API                       │                          │
                │  from: RESEND_FROM_EMAIL         │                          │
                │  to: rebekah@trueocean.com       │                          │
                │  subject: "Daily digest · {date}"│                          │
                └────────────┬────────────────────┘                          │
                             │                                                │
                  ┌──────────┴───────────┐                                   │
                  │ success?              │                                   │
                  ├───────┬──────────────┤                                   │
                  ▼       ▼              ▼                                   ▼
        ┌─────────────┐ ┌─────────────┐ ┌──────────────┐         ┌──────────────────┐
        │ tx:         │ │ tx:         │ │ tx:           │         │ on failure:       │
        │ Digest      │ │ DigestItem  │ │ DigestSend    │         │ Digest.status =   │
        │ status=SENT │ │ content=    │ │ INSERT row    │         │   PENDING (retry) │
        │ sentAt=now  │ │ [REDACTED]  │ │ for today     │         │ logger.error +    │
        └─────────────┘ └─────────────┘ └──────────────┘         │ captureException  │
                                                                  └──────────────────┘
```

### Recommended Project Structure

```
apps/web/app/api/cron/digest/
├── route.ts                      # NEW — cron entry, hasCronSecret auth, calls runDailyDigest()

apps/web/utils/digest/
├── run-daily-digest.ts           # NEW — orchestration: query → fetch → Sonnet → render → send → tx
├── pending-items.ts              # NEW — DB query for un-SENT DigestItems with rule name + action joins
├── digest-send.ts                # NEW — DigestSend create/check helpers
├── format.ts                     # EXISTING — formatDigestDate retained
├── index.ts                      # EXISTING — enqueueDigestItem retained (used by ActionType.DIGEST)
├── send-digest.ts                # EXISTING — keep as fallback / multi-channel; not used by new cron path
└── schedule.ts                   # EXISTING — Schedule-table-based progression; bypassed in single-tenant cron path

apps/web/utils/ai/digest/
├── generate-digest-content.ts    # NEW — single batched Sonnet call producing DigestV2Props payload
├── digest-prompt.ts              # NEW — system prompt with tone guardrails (D-03/D-04) + clustering rules (D-06/D-18)
├── digest-schema.ts              # NEW — zod schema for Sonnet output
└── summarize-email-for-digest.ts # EXISTING — orphaned per commit 102b3d89c; can delete in Phase 4 cleanup

packages/resend/emails/
├── digest-v2.tsx                 # EXISTING — locked visual contract
├── digest.tsx                    # EXISTING — upstream reference, untouched

packages/resend/
└── (export sendDigestV2Email if a new wrapper is needed; otherwise reuse render() inline in route.ts)

apps/web/prisma/migrations/<timestamp>_add_digest_send/
└── migration.sql                 # NEW — DigestSend table; SENDING enum value (if added)

deploy/
├── docker-compose.yml            # MODIFY — add QSTASH_TOKEN passthrough OR
└── inbox-zero.service            # MODIFY — add OnCalendar=*-*-* 13:00 UTC and an ExecStart curl invocation
                                  #          (only if going crontab route)
```

### Pattern 1: Cron route with Bearer auth

**What:** Standard Next.js App Router GET handler that verifies `CRON_SECRET`.
**When to use:** Every scheduled endpoint in this fork.
**Example:**

```typescript
// Source: apps/web/app/api/cron/scheduled-actions/route.ts:17-33
export const GET = withError("cron/scheduled-actions", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/..."));
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await processScheduledActions(request.logger);
  return NextResponse.json(result);
});
```

### Pattern 2: Sonnet structured output via createGenerateObject

**What:** JSON-mode call with zod schema, retry/repair built-in, usage tracking via `saveAiUsage`.
**When to use:** Every batched Sonnet call that needs structured output.
**Example (verified shape — not the digest call):**

```typescript
// Source: apps/web/utils/ai/digest/summarize-email-for-digest.ts:80-95
const modelOptions = getModel(emailAccount.user, "economy");  // for Phase 4: use "default" (Sonnet)
const generateObject = createGenerateObject({
  emailAccount,
  label: "digest-batch-summarize",       // Phase 4 label
  modelOptions,
  promptHardening: { trust: "untrusted", level: "compact" },  // CLAUDE.md says "full" for new code
});
const aiResponse = await generateObject({
  ...modelOptions,
  system,
  prompt,
  schema,    // zod schema
});
return aiResponse.object;  // typed
```

**CLAUDE.md note:** New LLM calls must use `promptHardening: { trust: "untrusted", level: "full" }` per ROADMAP cross-cutting constraints.

### Pattern 3: Gmail batch fetch with rate-limit pacing

**What:** Batch up to 100 message IDs, sleep 2s between batches.
**When to use:** Any path that fetches >100 messages in one request lifecycle.
**Example:**

```typescript
// Source: apps/web/app/api/resend/digest/route.ts:230-243
const messages: ParsedMessage[] = [];
const batchSize = 100;
for (let i = 0; i < messageIds.length; i += batchSize) {
  const batch = messageIds.slice(i, i + batchSize);
  const batchResults = await emailProvider.getMessagesBatch(batch);
  messages.push(...batchResults);
  if (i + batchSize < messageIds.length) await sleep(2000);
}
const messageMap = new Map(messages.map((m) => [m.id, m]));
```

### Pattern 4: Transactional state update on success

**What:** All-or-nothing Postgres write to mark digests SENT and redact content.
**When to use:** After successful email send.
**Example:**

```typescript
// Source: apps/web/app/api/resend/digest/route.ts:336-369
await prisma.$transaction([
  prisma.digest.updateMany({
    where: { id: { in: processedDigestIds } },
    data: { status: DigestStatus.SENT, sentAt: new Date() },
  }),
  prisma.digestItem.updateMany({
    data: { content: "[REDACTED]" },
    where: { digestId: { in: processedDigestIds } },
  }),
  // Phase 4 ADDITION:
  prisma.digestSend.create({ data: { date: todayET, sentAt: new Date(), itemCount, tokenCount, narrativeSnapshot } }),
]);
```

### Anti-Patterns to Avoid

- **Per-email Sonnet/Haiku call at digest send time.** This was already removed (commit 102b3d89c) — do not re-introduce. ONE batched call.
- **Per-account Schedule progression in single-tenant code.** The existing `getDigestScheduleProgression`/`isDigestScheduleDue` machinery is multi-tenant SaaS scaffolding. Bypass it; the cron schedule is the schedule.
- **Querying by `digestSchedule.nextOccurrenceAt` to find eligible accounts.** Single-tenant: `WHERE emailAccountId = <known>` directly.
- **Passing message bodies through prompt-hardening "compact".** New code: `level: "full"`.
- **Storing the cluster label as the message subject.** D-07 explicitly says cluster label is Sonnet-generated, not the subject line.
- **Using `digestItem.status`** — there is no such field. Status lives on the parent `Digest` row only (see Schema Anatomy below).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron schedule with TZ | Custom EC2 cron parser | `OnCalendar=*-*-* 13:00:00` (systemd) or QStash schedule with `tz: "America/New_York"` | DST is brittle to hand-roll; both options handle it |
| LLM JSON-mode + retry + repair | Custom prompt + JSON.parse | `createGenerateObject` from `apps/web/utils/llms` | Already handles `experimental_repairText`, schema validation, automatic fallback model, network retry, usage tracking |
| Email rendering | String concatenation or Handlebars | `@react-email/components` + `digest-v2.tsx` | Tailwind classes work in email; component is already locked visually |
| Email send + bounce handling | Direct Resend SDK call | `sendDigestEmail` from `@inboxzero/resend` workspace package | Already wraps Resend; matches the existing `sendDigestViaEmail` pattern |
| Bearer auth for cron | Custom JWT or HMAC | `hasCronSecret(request)` from `utils/cron.ts` | Standard pattern in this codebase; logs unauthorized attempts |
| Token-cost monitoring | Custom counter | `saveAiUsage` (auto-called inside `createGenerateObject`) | Already wired to Postgres `Usage` table |
| Transactional multi-update | Sequential awaits | `prisma.$transaction([ ... ])` | Atomic; existing pattern at line 336 of digest route |

**Key insight:** Every primitive already exists. Phase 4 is a wiring job — write the orchestration glue, not new infrastructure.

## Runtime State Inventory

> Phase 4 is greenfield wiring on top of existing schema; this section is included because Phase 4 also retires/replaces the old `aiSummarizeEmailForDigest` path and adds new env vars and DB tables.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (1) **218 pre-existing `Digest` rows** with `status=PENDING` (per CONTEXT.md D-16). Note: count is 218 *Digest* rows or *DigestItem* rows — CONTEXT.md says "DigestItem" but `status` only exists on `Digest`; plan-phase MUST verify the table from prod via `sudo docker exec inbox-zero-postgres psql -U inboxzero -d inboxzero -c 'SELECT count(*) FROM "Digest" WHERE status != '"'"'SENT'"'"';'` and adjust the backfill SQL accordingly. (2) ~12% DIGEST `ExecutedAction` rows have NO matching `DigestItem` (anomaly A2 from Phase 3). Source of gap analyzed below. | (1) one-shot SQL UPDATE during deploy; (2) investigate and decide |
| **Live service config** | (1) `RESEND_FROM_EMAIL` already set in SSM (`/inbox-zero/RESEND_FROM_EMAIL`) — value: `Inbox Zero <inbox-digest@tdfurn.com>` per env.ts default. (2) `CRON_SECRET` already set per docker-compose.yml line 106. (3) `QSTASH_TOKEN` — **not present in docker-compose.yml env passthrough** (see line 56–106); plan-phase to verify SSM and add to compose if QStash route chosen. | Add `QSTASH_TOKEN` passthrough OR pick crontab route |
| **OS-registered state** | NO existing scheduler hosts the cron. `vercel.json` defines `/api/resend/digest/all` at `0 * * * *` and `/api/cron/automation-jobs` at `*/15 * * * *`, but this fork does NOT run on Vercel. EC2 has no `/etc/crontab` or systemd timer pointing at the app. **The hourly digest cron has been silently never-firing.** This is partial root cause of the 218-row backlog. | Phase 4 MUST stand up a real scheduler — either systemd timer on EC2 hitting `https://inbox.tdfurn.com/api/cron/digest` with Bearer header, OR QStash schedule (requires `QSTASH_TOKEN` propagation) |
| **Secrets/env vars** | New env vars proposed: `DIGEST_TO=rebekah@trueocean.com` (or hardcode), optionally `DIGEST_CRON_TZ=America/New_York` (used only if scheduler runs in-process). No rotation needed for existing secrets. | Add new SSM params, propagate to docker-compose.yml |
| **Build artifacts** | None affected. | none |

**The canonical question — what runtime systems still have stale state after a code-only deploy?** Three: (a) the 218 pending Digest rows that need flipping to SENT, (b) the docker-compose.yml env block that needs new vars, (c) the OS-level scheduler that needs a new entry.

## DigestItem Creation Gap Investigation (Anomaly A2)

**Question:** Why do ~12% of DIGEST `ExecutedAction` rows lack a matching `DigestItem`?

**Code path traced:**
1. `apps/web/utils/ai/actions.ts:91` — DIGEST action triggers `digest()` function (line 453)
2. `digest()` calls `enqueueDigestItem()` (line 470) which is `apps/web/utils/digest/index.ts:10`
3. `enqueueDigestItem` calls `enqueueBackgroundJob` with topic `ai-digest` and path `/api/ai/digest`
4. Worker/QStash forwards POST to `/api/ai/digest/route.ts`
5. Route calls `upsertDigest` (line 47) which writes the DigestItem

**Observed failure modes:**

| Step | Failure mode | Evidence |
|------|--------------|----------|
| 2 | Plan check rejects: `checkHasAccess(...minimumTier:"PLUS_MONTHLY")` returns false → `digest()` returns silently with no log to ExecutedAction | actions.ts:460-467 |
| 3 | `enqueueBackgroundJob` throws → `enqueueDigestItem` catches and logs but does not re-throw → ExecutedAction completes successfully without queueing | index.ts:43-45 |
| 4 | QStash signature verification fails OR worker is offline → POST never hits `/api/ai/digest` |  |
| 5a | Route also re-checks `checkHasAccess` and returns 200 without writing | digest/route.ts:29-36 |
| 5b | Route checks `message.from === RESEND_FROM_EMAIL` and skips | digest/route.ts:39-42 |
| 5c | Outer try/catch returns 500 → QStash retries up to topic config (60s), but Phase 3 verification didn't capture retry exhaustion | digest/route.ts:57-60 |

**Most likely culprit (HIGH confidence):** `enqueueBackgroundJob` silently failing in the absence of `QSTASH_TOKEN` AND `INTERNAL_API_KEY` propagation, OR worker not running. Combined with the silent-catch in `enqueueDigestItem`, the gap is invisible upstream of the database.

**Plan-phase recommendation:**
- **Fix-now (preferred):** Add structured logging at every drop point (`hasDigestAccess` denial, queue-enqueue failure, route 500). Re-throw from `enqueueDigestItem` to surface the failure. Reconcile by re-running historical DIGEST `ExecutedAction` rows that have no matching `DigestItem` (small one-off backfill query).
- **Defer-acceptable:** Document the gap in 04-VALIDATION.md as a known issue, target Phase 5 or 6 for repair. The 12% loss is non-fatal — emails are still classified and labeled correctly; they just don't appear in tomorrow's digest. For Phase 4 first-real-digest, this means ~7 of every 60 emails won't show up. Acceptable for v1.

**Recommendation: defer to a Phase 4 follow-up wave** but add the structured logging hooks now (5-line change in `enqueueDigestItem` + `digest()`).

## Schema Anatomy (verified from `apps/web/prisma/schema.prisma`)

```prisma
model Digest {                    // line 287
  id             String       @id @default(cuid())
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  emailAccountId String
  emailAccount   EmailAccount @relation(...)
  items          DigestItem[]
  sentAt         DateTime?
  status         DigestStatus @default(PENDING)   // ← STATUS IS HERE
  @@index([emailAccountId])
}

model DigestItem {                // line 300
  id          String          @id @default(cuid())
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  messageId   String
  threadId    String
  content     String          @db.Text             // ← currently empty string for un-summarized items
  digestId    String
  digest      Digest          @relation(...)
  actionId    String?
  action      ExecutedAction? @relation(...)
  // NO status field — CONTEXT.md is wrong about DigestItem.status
  @@unique([digestId, threadId, messageId])
  @@index([actionId])
}

enum DigestStatus {               // line 1631
  PENDING
  PROCESSING
  SENT
  FAILED
  // No SENDING — code uses PROCESSING for the in-flight state
}
```

**Key correction for plan-phase:**
- CONTEXT.md D-14 says "Per-DigestItem `SENT` flag" and D-16 says "`UPDATE DigestItem SET status = 'SENT'`" — **these are incorrect.** Status lives on `Digest`, not `DigestItem`. The 218-row backfill SQL must target `Digest`, not `DigestItem`.
- CONTEXT.md says `SENDING` may need adding — the existing enum has `PROCESSING` which is functionally equivalent. **Recommend reusing `PROCESSING`; do NOT migrate.**
- The DIGEST send pipeline already has the state machine at `route.ts:185-197`: `PENDING → PROCESSING → SENT (or FAILED)`. Phase 4 reuses it.

## DigestSend Table Design (recommended)

```prisma
model DigestSend {
  id                String   @id @default(cuid())
  emailAccountId    String                                      // future-proof; for v1 always Rebekah's
  emailAccount      EmailAccount @relation(...)
  date              DateTime @db.Date                           // NY date, see below
  sentAt            DateTime @default(now())
  itemCount         Int                                         // number of DigestItems included
  tokenCountInput   Int?                                        // for cost monitoring
  tokenCountOutput  Int?
  modelUsed         String?                                     // e.g. "claude-sonnet-4-6"
  narrativeSnapshot String?  @db.Text                           // for replay/debug — store narrativeBody only
  digestIds         String[]                                    // FKs to Digest rows included; postgres array
  resendMessageId   String?                                     // Resend's message id for bounce tracking

  @@unique([emailAccountId, date])                              // dedup key — IDEMPOTENCY
  @@index([emailAccountId, sentAt])
}
```

**Dedup key choice — UTC vs. ET date?** **Recommend ET (`America/New_York` calendar date).**
- The cron fires at 9am ET, which is 13:00–14:00 UTC depending on DST.
- A second cron fire at 9:01am ET (e.g. retry) lands on the same ET date; idempotency catches it.
- A UTC-keyed dedup would correctly catch the same case but become surprising during DST transitions if the user later wants to inspect "today's digest" in psql.
- **Implementation:** `const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())` → `"2026-05-04"`, then `new Date(todayET)` for the column. `[VERIFIED: Intl.DateTimeFormat supports timeZone]`

**Should `narrativeSnapshot` be stored?** Yes — small (< 2KB), enormous debug value. Rebekah might want to compare yesterday's narrative to today's; the email itself is in Sent.

## Common Pitfalls

### Pitfall 1: Hourly cron in vercel.json that doesn't actually fire
**What goes wrong:** Plan-phase sees `vercel.json` defining `/api/resend/digest/all` at `0 * * * *` and assumes a cron is firing. **It is not** — this fork is on EC2/Docker, not Vercel.
**Why it happens:** `vercel.json` is upstream artifact; the fork inherits it but doesn't honor it.
**How to avoid:** Phase 4 plan-phase MUST stand up a real scheduler (systemd timer, QStash, or one-off Lambda). Verify by curling the endpoint manually before declaring done; verify by checking server logs for the scheduled hit.
**Warning signs:** No log entries from `cron/automation-jobs` route in production logs; 218 unsent Digest rows.

### Pitfall 2: TZ confusion in cron expressions
**What goes wrong:** `0 9 * * *` in a system cron evaluates against the system clock TZ. EC2 default is UTC. 9am UTC = 5am ET (DST) or 4am ET (standard). Digest fires at the wrong hour year-round.
**How to avoid:** Use systemd OnCalendar with explicit timezone OR QStash schedule with `cron`+`tz: "America/New_York"`. Never hand-roll DST math.
**Warning signs:** Digest arrives at the wrong local time, especially on the day DST transitions.

### Pitfall 3: Sonnet output bursts past max output tokens
**What goes wrong:** With 30–50 items each needing a per-item summary plus narrative plus clustering, Sonnet can hit `max_tokens` and produce truncated JSON. `experimental_repairText` saves some cases, but not all.
**How to avoid:** Set `max_tokens: 8000` explicitly; instruct Sonnet to keep per-item summaries to ≤25 words; instruct cluster summaries to ≤30 words; require narrativeBody ≤ 4 sentences.
**Warning signs:** `NoObjectGeneratedError` in logs; truncated narrative; missing autoFiled groups.

### Pitfall 4: Tone guardrail bypassed by humorous holiday detection
**What goes wrong:** Sonnet sees "Today is Memorial Day" in prompt and writes a snarky line — but Memorial Day is a remembrance holiday, not Talk-Like-a-Pirate Day. Tone-deaf.
**How to avoid:** System prompt has a TWO-STEP directive — first list of "solemn-only" markers (Memorial Day, Holocaust Remembrance, 9/11, MLK Day mood-aware), then list of "playful-OK" markers. Provide explicit examples. Pair with the grief/illness/distress guardrail (D-04).
**Warning signs:** Manual review of the first weeks of digests catches off-tone narratives. Build a flag-and-review log if any narrative contains both a holiday reference AND a solemn keyword in the same paragraph.

### Pitfall 5: Marketing rule has no DIGEST action
**What goes wrong:** Plan-phase queries DigestItems but finds zero Marketing items because the Marketing rule was set LABEL+ARCHIVE only (Phase 3 D-05). Digest renders an empty Marketing section.
**How to avoid:** Plan-phase MUST add DIGEST action to the Marketing rule's actions table. Verified: `Rule.systemType = MARKETING`, name `"Marketing"` per `utils/rule/consts.ts:71`. Existing prod query: `SELECT * FROM "Action" WHERE "ruleId" IN (SELECT id FROM "Rule" WHERE "systemType"='MARKETING');`. If absent, add: `INSERT INTO "Action" (id, type, "ruleId") VALUES (cuid(), 'DIGEST', <marketing-rule-id>);`. **Recommended approach:** Option (a) from CONTEXT.md open question 2 — add DIGEST action. Cleanest because it reuses the existing `enqueueDigestItem` plumbing without special-case routing.
**Warning signs:** First real digest has no Marketing section despite known marketing emails.

### Pitfall 6: Resend's html-string render loses Tailwind classes
**What goes wrong:** Calling `render(<DigestV2 ... />)` without the right pipeline can drop Tailwind class compilation. `digest-v2.tsx` uses many bracket utilities like `text-[14px]`.
**How to avoid:** Use `@react-email/components` `<Tailwind>` wrapper (already in `digest-v2.tsx:159`); rendered via `@react-email/render` produces inline CSS. The existing `@inboxzero/resend.sendDigestEmail` already does this for `digest.tsx` — extend or duplicate the pattern for `digest-v2.tsx`.
**Warning signs:** Test send shows unstyled HTML; verify with `packages/resend/scripts/render-digest-v2.ts`.

### Pitfall 7: Backfill SQL races with active cron
**What goes wrong:** Run backfill SQL while cron is also running → some rows transition to SENT twice or get marked SENT by backfill while in-flight in cron.
**How to avoid:** Backfill BEFORE deploying the new cron schedule. Or set `WHERE createdAt < NOW() - INTERVAL '1 hour'` to exclude in-flight items.
**Warning signs:** Sentry exception about transitioning a SENT digest to PROCESSING.

## Code Examples

### Sonnet batched-content generation (recommended shape)

```typescript
// File: apps/web/utils/ai/digest/generate-digest-content.ts (NEW)
// Source pattern: apps/web/utils/ai/digest/summarize-email-for-digest.ts:80-95 (verified)
import { z } from "zod";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";

const digestContentSchema = z.object({
  narrativeGreeting: z.string().describe("Short greeting like 'Morning, Rebekah —' or holiday-flavored variant"),
  narrativeBody: z.string().describe("3-4 sentence personal-assistant overview, italic in template; humor allowed unless any item is grief/illness/legal/distress"),
  urgent: z.array(z.object({
    messageId: z.string(),
    summary: z.string().describe("Professional, no humor. ≤25 words. Why it's urgent + what's needed."),
  })),
  uncertain: z.array(z.object({
    messageId: z.string(),
    summary: z.string().describe("≤25 words. Why classifier hesitated; what would help."),
  })),
  autoFiled: z.object({
    receipts: z.array(z.object({
      label: z.string().describe("Cluster noun: 'Starbucks', 'Fuel', 'Amazon'"),
      summary: z.string().describe("Cluster summary, can be playful, ≤30 words"),
      memberMessageIds: z.array(z.string()),
    })),
    newsletters: z.array(z.object({
      label: z.string(),
      summary: z.string(),
      memberMessageIds: z.array(z.string()),
    })),
    marketing: z.array(z.object({
      label: z.string().describe("If promotional: prefix 'Deals — '. E.g. 'Deals — outdoor', 'Deals — software'"),
      summary: z.string(),
      memberMessageIds: z.array(z.string()),
    })),
    notifications: z.array(z.object({
      label: z.string(),
      summary: z.string(),
      memberMessageIds: z.array(z.string()),
    })),
  }),
});

export type DigestContent = z.infer<typeof digestContentSchema>;

export async function generateDigestContent({
  emailAccount,
  todayDate,
  bucketed,
}: {
  emailAccount: EmailAccountWithAI & { name: string | null };
  todayDate: string;       // "Monday, May 4, 2026"
  bucketed: {
    urgent: Array<{ messageId: string; subject: string; from: string; body: string }>;
    uncertain: Array<{ messageId: string; subject: string; from: string; body: string }>;
    receipts: Array<{ messageId: string; subject: string; from: string; body: string }>;
    newsletters: Array<{ messageId: string; subject: string; from: string; body: string }>;
    marketing: Array<{ messageId: string; subject: string; from: string; body: string }>;
    notifications: Array<{ messageId: string; subject: string; from: string; body: string }>;
  };
}): Promise<DigestContent> {
  const modelOptions = getModel(emailAccount.user, "default");  // Sonnet
  const generateObject = createGenerateObject({
    emailAccount,
    label: "digest-batch-content",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },     // CLAUDE.md mandate
  });
  const aiResponse = await generateObject({
    ...modelOptions,
    system: DIGEST_SYSTEM_PROMPT,        // see digest-prompt.ts
    prompt: buildDigestPrompt({ todayDate, bucketed }),
    schema: digestContentSchema,
  });
  return aiResponse.object;
}
```

### Tone-guardrail system prompt (skeleton)

```typescript
// File: apps/web/utils/ai/digest/digest-prompt.ts (NEW)
export const DIGEST_SYSTEM_PROMPT = `You are Rebekah's personal email assistant writing a daily morning digest. Output strictly matches the JSON schema.

VOICE
- Conversational, warmly direct, lightly funny, gentle sarcasm allowed.
- Sound like a smart friend who skimmed her inbox.

SECTION TONE RULES
- urgent[*].summary: PROFESSIONAL only. No humor, no metaphors, no sarcasm. State why urgent and what's needed.
- uncertain[*].summary: Mild personality OK. Acknowledge ambiguity directly.
- autoFiled.*: Personality, mild sarcasm, observational humor encouraged.

HARD GUARDRAIL — DROP HUMOR ENTIRELY IF:
- Any item references: death, dying, terminal illness, hospice, funeral, miscarriage, suicide, self-harm
- Any item references: divorce, custody dispute, restraining order, eviction, bankruptcy, foreclosure, garnishment
- Any item references: layoff (recipient's own), termination, severance, loss of benefits
- Any item references: legal threat, lawsuit, subpoena, cease-and-desist, ICE/immigration enforcement
- Any item references: medical emergency for self or family member, ICU, surgery
If ANY item triggers the above, render narrativeGreeting flat ("Good morning, Rebekah.") and narrativeBody factual without observation, jokes, or holiday references. Use professional tone in ALL sections including auto-filed.

HOLIDAY/OBSERVANCE HANDLING (only when guardrail not triggered)
- Today's date: {{TODAY}}.
- Solemn observances (use only as factual reference, no jokes): Memorial Day, Holocaust Remembrance Day, 9/11, MLK Day, Yom Kippur, Good Friday, Veterans Day.
- Light/playful observances OK: National Donut Day, Pi Day, Star Wars Day, Talk Like a Pirate Day.
- If today is none of the above, skip holiday references.

CLUSTERING (autoFiled sections)
- Cluster items by sender ("Starbucks") OR cross-sender topic ("Fuel: Wawa, BP, Shell").
- One row per cluster. Cluster label is the noun; summary is the action/observation.
- For Marketing: if promotional, prefix label with "Deals — " then topic ("Deals — outdoor", "Deals — software").
- The cluster label is YOUR noun, NOT the email subject line.

LENGTH BUDGET
- narrativeBody: ≤ 4 sentences.
- per-item summary: ≤ 25 words.
- per-cluster summary: ≤ 30 words.

Output JSON matching the provided schema. memberMessageIds must list every messageId you grouped into the cluster.`;
```

### Cron route (skeleton)

```typescript
// File: apps/web/app/api/cron/digest/route.ts (NEW)
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { runDailyDigest } from "@/utils/digest/run-daily-digest";

export const maxDuration = 300;

export const GET = withError("cron/digest", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/digest"));
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runDailyDigest(request.logger);
  return NextResponse.json(result);
});

export const POST = withError("cron/digest", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(new Error("Unauthorized cron request: api/cron/digest"));
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runDailyDigest(request.logger);
  return NextResponse.json(result);
});
```

### Cron Scheduler in This Fork — VERIFIED ANSWER to open question 1

`vercel.json` defines crons (`apps/web/vercel.json:62-87`) for `/api/cron/scheduled-actions`, `/api/watch/all`, `/api/resend/digest/all`, etc. **However:**
- This fork runs on EC2/Docker (not Vercel) — `deploy/docker-compose.yml` confirms
- `deploy/inbox-zero.service` has no cron / timer hooks
- `deploy/load-secrets.sh` has no scheduler logic
- `QSTASH_TOKEN` is NOT in the docker-compose.yml env passthrough (lines 56–106) — even if SSM has it, the container can't see it
- BullMQ via `apps/worker` exists but is a queue *consumer*, not a *scheduler* — it needs something to enqueue recurring jobs

**Therefore: no scheduler is currently running.** The hourly digest endpoint has been silently never-firing since deploy. This explains the 218 backlog.

**Plan-phase options:**

1. **Systemd timer on EC2 (RECOMMENDED — simplest, no new infra)**
   ```ini
   # /etc/systemd/system/inbox-zero-digest.timer
   [Timer]
   OnCalendar=*-*-* 09:00:00 America/New_York
   Persistent=true       # fire on next boot if missed
   [Install]
   WantedBy=timers.target

   # /etc/systemd/system/inbox-zero-digest.service
   [Service]
   Type=oneshot
   EnvironmentFile=/opt/inbox-zero/.env
   ExecStart=/usr/bin/curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" https://inbox.tdfurn.com/api/cron/digest
   ```
   `[CITED: systemd.time(7) — OnCalendar accepts an explicit timezone suffix as of systemd 247]`

2. **QStash schedules.** Wire `QSTASH_TOKEN` through docker-compose, create schedule via QStash dashboard or API: `cron: "0 9 * * *"`, `timezone: "America/New_York"`, `destination: "https://inbox.tdfurn.com/api/cron/digest"`. `[VERIFIED: QSTASH_TOKEN already in env.ts schema; @upstash/qstash already in package; no new deps]`. `[CITED: docs.upstash.com/qstash/features/schedules — supports IANA timezones]`

3. **AWS EventBridge.** Cron → API Gateway → endpoint. New AWS infra; not recommended.

**Recommendation:** Systemd timer. Keeps everything on the EC2 box (already in scope per OPS-01 etc.), DST-correct, restartable, persistent across reboots, observable via `journalctl -u inbox-zero-digest`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-email Haiku summarize | Batched-at-send-time Sonnet summarize | commit `102b3d89c` (2026-05-04) | One LLM call/day instead of one per email; ~$5–10/mo savings; visual fidelity gain |
| Multi-tenant Schedule progression | Single-tenant 9am ET hardcoded cron | Phase 4 D-12 | Bypasses `Schedule.nextOccurrenceAt` machinery |
| List-only `digest.tsx` template | Cluster-narrative `digest-v2.tsx` | Phase 4 discuss-phase (2026-05-04) | New typed prop shape `DigestV2Props` |
| Thumbs-up/down feedback in email | "Review in app →" deep-link only | Phase 4 D-10 | DIGEST-07 deferred to Phase 6 |
| Deals as standalone rule | Sonnet sub-cluster inside Marketing | Phase 4 D-18 | DIGEST-03 reframed; one fewer rule to maintain |

**Deprecated/outdated:**
- `apps/web/utils/ai/digest/summarize-email-for-digest.ts` — orphaned per commit 102b3d89c. Plan-phase can delete during Phase 4 cleanup wave.
- The `aiSummarizeEmailForDigest` regression test (`__tests__/ai-regression/ai-summarize-email-for-digest.test.ts`) — also orphaned.
- `apps/web/app/api/resend/digest/route.ts` — Phase 4 builds a parallel `/api/cron/digest`; this older route can be left intact (still triggerable by GET-as-self for emergency manual sends) or removed in cleanup. Decision: **keep as fallback** for v1.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | systemd OnCalendar with explicit IANA timezone suffix is supported on the EC2 host's systemd version | Cron Scheduler | Wrong → fall back to QStash. EC2 22.04 LTS has systemd 249 which supports it (`[CITED: man systemd.time(5)]`); but plan-phase to verify with `systemd --version` on the actual host. |
| A2 | The "218 rows" referenced in CONTEXT.md D-16 are `Digest` rows, not `DigestItem` rows | Schema Anatomy | Wrong → backfill SQL targets wrong table. Plan-phase MUST verify via `psql` count before writing the SQL. |
| A3 | `QSTASH_TOKEN` is in SSM but not in docker-compose.yml | Runtime State Inventory | Wrong → already fully wired and the cron has been firing. But evidence (218 rows + zero Digest.sentAt) refutes that. |
| A4 | Marketing rule currently has LABEL+ARCHIVE actions but no DIGEST | Pitfall 5 | Wrong → no schema change needed for Marketing. Plan-phase to verify with `psql`: `SELECT type FROM "Action" WHERE "ruleId" IN (SELECT id FROM "Rule" WHERE "systemType"='MARKETING');` |
| A5 | Sonnet 4.6 produces stable JSON-mode output at 8K max_tokens for ~50 items | Pitfall 3 | Wrong → cap items per digest at 30 and emit overflow note. Verify in Wave 1 testing. |
| A6 | `Intl.DateTimeFormat` with `timeZone: "America/New_York"` returns ET calendar date correctly across DST | DigestSend Design | LOW risk — well-established Node API since v14. `[CITED: MDN Intl.DateTimeFormat]` |
| A7 | The 218-row backfill predates Phase 3 deploy timestamp and isn't growing | D-16 application | If still growing → backfill SQL must be deferred until cron is stood up to prevent gap-between-backfill-and-first-real-digest. |

## Open Questions (RESOLVED in this research)

1. ~~What scheduler runs the cron?~~ **RESOLVED:** Nothing. Plan-phase must stand one up. Systemd timer recommended.
2. ~~Marketing rule DIGEST action.~~ **RESOLVED:** Add DIGEST action to the existing Marketing rule (option a). Schema, query, and routing all support it; cleanest path. Plan-phase to verify current actions list and write the migration/seed.
3. ~~DigestItem creation gap.~~ **PARTIALLY RESOLVED:** Most likely silent failure in `enqueueBackgroundJob` due to QStash/worker config. Recommend adding structured logging in Phase 4 + a small reconciliation backfill. Defer the full fix to a follow-up; not a Phase 4 blocker.
4. ~~Sonnet cost projection.~~ **RESOLVED:** See Cost Projection section below — $1.80–$5.40/mo, comfortably under ceiling.
5. ~~DigestSend table schema.~~ **RESOLVED:** See "DigestSend Table Design" section.
6. ~~Failure visibility.~~ **RESOLVED:** Logs + Sentry + a 24h-no-send detection check (see Failure Visibility section).

## Cost Projection (refined)

**Inputs:**
- ~30–50 DigestItems per day per Phase 3 verification (organic data observed ~85 emails/day classified, of which ~60% generate DigestItems)
- Average email body for digest purposes (after `emailToContentForAI` sanitization): ~600 tokens
- System prompt + clustering rules + tone guardrails: ~1500 tokens
- User context + today's date: ~100 tokens
- 50 items × 600 = 30,000 input tokens of bodies + 1,600 prompt overhead = **~32K input tokens worst case**, ~22K typical

**Outputs:**
- narrativeBody (~150 tokens) + greeting (~10) + 2 urgent × 25 (~50) + 2 uncertain × 25 (~50) + 4 autoFiled × 3 clusters × 30 (~360) + JSON structural overhead (~200) = **~820 output tokens** typical, **~1500 worst case**

**Sonnet 4.6 pricing** `[VERIFIED: pricing.generated.ts:42]`: $3/MTok input, $15/MTok output

**Per-digest cost:**
- Typical: 22K × $3/M + 820 × $15/M = $0.066 + $0.012 = **$0.078**
- Worst case: 32K × $3/M + 1500 × $15/M = $0.096 + $0.022 = **$0.118**

**Monthly (30 sends):**
- Typical: $2.34/mo
- Worst case: $3.54/mo

**Combined with Phase 3 Haiku classification (~$10/mo at ceiling per STATE.md):** total system cost **$12–14/mo**, slightly over the $10/mo "additional cost" ceiling. **However** the $10/mo ceiling explicitly refers to *additional* cost over the Inbox Zero baseline, and Phase 3 already absorbed that budget. Phase 4 is digest-only spend on top.

**Verdict:** Phase 4 alone fits in $3–4/mo. **Combined system trends slightly over $10/mo** at peak load — flag for Phase 7 cost review. Consider Anthropic prompt caching if peak-load digests become routine (`cachedInput` is $0.30/MTok = 90% reduction); not Phase 4 work.

## Failure Visibility (recommended)

For v1, three layers — none over-engineered:

1. **Structured logs** at every decision point in `runDailyDigest`. Already wired via `logger.with(...)` pattern.
2. **Sentry capture** on any thrown error. Existing pattern: `captureException(error, { ... })` (see `digest/route.ts:382`).
3. **Stale-digest detection** — Phase 4 adds a tiny "did digest send today?" health endpoint (`/api/health/digest-status`) that returns 200 if a `DigestSend` row exists for today, 503 otherwise. Could be polled by an external uptime monitor (UptimeRobot free tier) — alerts Rebekah by email/SMS if 503 persists past 10am ET. **Deferred — not blocking v1.**
4. **First-week manual review.** Rebekah reads the digest. If it doesn't arrive, she'll know within hours. Single-tenant; she IS the alerting system for v1.

## Backfill Mechanism (recommended)

```sql
-- Run via: sudo docker exec inbox-zero-postgres psql -U inboxzero -d inboxzero -c "..."
-- Or: prisma db execute --file backfill.sql --schema apps/web/prisma/schema.prisma

-- Verify count first
SELECT count(*), status FROM "Digest"
  WHERE status != 'SENT' AND "createdAt" < '2026-05-04 00:00:00'
  GROUP BY status;
-- Expect: ~218 rows in PENDING (verify before running update)

-- Apply backfill
UPDATE "Digest"
  SET status = 'SENT', "sentAt" = "createdAt", "updatedAt" = NOW()
  WHERE status != 'SENT'
    AND "createdAt" < '2026-05-04 00:00:00';   -- replace with actual deploy timestamp

-- Optional: redact stale content (small, but good hygiene)
UPDATE "DigestItem"
  SET content = '[REDACTED]'
  WHERE "digestId" IN (
    SELECT id FROM "Digest"
      WHERE status = 'SENT' AND "sentAt" = "createdAt"  -- backfilled rows
  );
```

**Mechanism choice:** **One-shot SQL via `docker exec`** is simplest and matches the Postgres credentials memory note. No need for a Prisma seed (those are seed-data, not migrations). Could also be wrapped in a deploy hook step if Phase 4 rebuilds the container.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Anthropic API | Sonnet narrative | ✓ (prepaid credits) | sonnet-4-6 | None — blocking |
| Resend API | Email send | ✓ | RESEND_API_KEY in SSM | None — blocking |
| Postgres | DigestSend table, queries | ✓ | 16-alpine per docker-compose.yml | None — blocking |
| Gmail API | Message body fetch | ✓ (via existing OAuth) | refreshable token in DB | None — blocking |
| Scheduler | Trigger 9am ET cron | **✗ NOT AVAILABLE** | — | Set up systemd timer in Phase 4 (BLOCKER if unaddressed) |
| QStash | Optional scheduler path | ⚠ (TOKEN in SSM, not in docker-compose passthrough) | — | Use systemd timer instead |
| date-fns-tz | (potential) TZ math in code | (need check via package.json) | — | Use Intl.DateTimeFormat |

**Missing dependencies with no fallback:**
- Scheduler — must be added in Phase 4 plan (systemd timer recommended)

**Missing dependencies with fallback:**
- QStash — fallback to systemd is clean

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.x (per existing `*.test.ts` files) |
| Config file | `apps/web/vitest.config.ts` (existing) |
| Quick run command | `pnpm test -- path/to/file.test.ts` |
| Full suite command | `pnpm test` (from apps/web) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIGEST-01 | Cron endpoint authenticates with CRON_SECRET; returns 401 on missing/wrong header | unit | `pnpm test -- utils/digest/run-daily-digest.test.ts -t "auth"` | ❌ Wave 0 |
| DIGEST-01 | Endpoint at 9am ET fires (manual smoke test on day-of-deploy) | manual | curl with Bearer header | n/a |
| DIGEST-01 | Idempotency: second call same date is no-op | unit | `pnpm test -- utils/digest/run-daily-digest.test.ts -t "idempotency"` | ❌ Wave 0 |
| DIGEST-01 | TZ correctness: `getTodayET()` returns NY-calendar date during DST forward + back | unit | `pnpm test -- utils/digest/today-et.test.ts` | ❌ Wave 0 |
| DIGEST-02 | Urgent items render with sender, subject, summary | snapshot | `pnpm test -- packages/resend/emails/digest-v2.test.tsx` | ❌ Wave 0 |
| DIGEST-03 | Marketing section renders cluster prefixed "Deals — " when given promotional fixtures | unit | `pnpm test -- ai/digest/digest-prompt.test.ts -t "deals"` | ❌ Wave 0 |
| DIGEST-04 | All four auto-filed groups render in correct order | snapshot | `pnpm test -- packages/resend/emails/digest-v2.test.tsx -t "ordering"` | ❌ Wave 0 |
| DIGEST-05 | Uncertain items render Review URL with itemId | snapshot | `pnpm test -- packages/resend/emails/digest-v2.test.tsx -t "review-url"` | ❌ Wave 0 |
| DIGEST-06 | Sonnet returns valid `digestContentSchema`; tone guardrail fires on grief fixture | unit + ai-regression | `pnpm test-ai -- ai/digest/generate-digest-content.test.ts` (RUN_AI_TESTS=true) | ❌ Wave 0 |
| DIGEST-06 | Token budget: 50-item batch stays under 8K output tokens | ai-regression | `pnpm test-ai -- ai/digest/token-budget.test.ts` | ❌ Wave 0 |
| Backfill | SQL marks exactly N rows where N = pre-deploy PENDING count | smoke | post-deploy psql verification | n/a |

### Sampling Rate
- **Per task commit:** `pnpm test -- <changed-file>.test.ts -x` (≤ 30s)
- **Per wave merge:** `pnpm test` from `apps/web` (full unit suite, ~2min)
- **Phase gate:** Full suite + manual end-to-end smoke send to rebekah@trueocean.com before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/web/utils/digest/run-daily-digest.test.ts` — covers DIGEST-01 (auth, idempotency, state machine)
- [ ] `apps/web/utils/digest/today-et.test.ts` — covers DST behavior of date helper
- [ ] `apps/web/utils/ai/digest/generate-digest-content.test.ts` — covers DIGEST-06 schema + guardrail
- [ ] `apps/web/utils/ai/digest/digest-prompt.test.ts` — covers DIGEST-03 Deals clustering
- [ ] `packages/resend/emails/digest-v2.test.tsx` — snapshot tests covering DIGEST-02/04/05
- [ ] AI-regression fixtures: grief-email, legal-threat-email, illness-email (for guardrail testing)
- [ ] Manual: smoke-test send via `packages/resend/scripts/send-digest-v2-test.ts` (script already exists per CONTEXT.md `<files_of_interest>`)

## Sources

### Primary (HIGH confidence)
- `apps/web/prisma/schema.prisma` lines 287–317 (Digest, DigestItem), 1631–1636 (DigestStatus enum) — schema anatomy
- `apps/web/app/api/resend/digest/route.ts` — full existing send pipeline reference
- `apps/web/utils/ai/digest/summarize-email-for-digest.ts` — canonical Sonnet/Haiku JSON-mode pattern
- `apps/web/utils/llms/index.ts` — `createGenerateObject` signature
- `apps/web/utils/llms/pricing.generated.ts` lines 22–46 — Sonnet 4.6 / Haiku 4.5 verified pricing
- `apps/web/utils/cron.ts` — CRON_SECRET Bearer auth pattern
- `apps/web/utils/digest/index.ts`, `send-digest.ts`, `format.ts`, `schedule.ts` — existing digest utilities
- `apps/web/utils/ai/actions.ts` lines 91, 453–476 — DIGEST action execution path
- `apps/web/utils/rule/consts.ts` lines 70–80 — Marketing rule config
- `apps/web/vercel.json` — upstream cron declarations (NOT honored in this fork)
- `deploy/docker-compose.yml`, `deploy/inbox-zero.service` — runtime environment
- `packages/resend/emails/digest-v2.tsx` — locked visual contract; `DigestV2Props`, `ActionItem`, `AutoFiledGroup` types
- `packages/resend/emails/digest.tsx` — upstream reference template
- Commit `102b3d89c` — per-email summarize removal context
- `.planning/phases/04-daily-digest/04-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- systemd OnCalendar timezone-suffix syntax — `[CITED: man systemd.time(5)]`
- QStash schedules with IANA tz — `[CITED: docs.upstash.com/qstash/features/schedules]`
- `Intl.DateTimeFormat` timeZone option behavior — `[CITED: MDN Intl.DateTimeFormat]`

### Tertiary (LOW confidence)
- Anthropic Sonnet 4.6 actual response stability at 8K max output tokens — `[ASSUMED]`. Verify in Wave 1 with a 50-item smoke test.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive verified in-repo
- Architecture: HIGH — patterns extracted from existing routes
- Pitfalls: HIGH — six pitfalls grounded in observed gaps (218 rows, missing scheduler, schema anatomy correction, prompt-hardening level, Marketing rule actions, Tailwind-in-email render)
- Cost projection: MEDIUM — input/output token estimates are reasonable but per-email body size has high variance
- Scheduler recommendation: MEDIUM — systemd is recommended but plan-phase should verify the host's systemd version and may prefer QStash for portability

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days; stable codebase, verified in-repo signals; only external risk is Anthropic model deprecation)