# Phase 4: Daily Digest - Pattern Map

**Mapped:** 2026-05-04
**Files analyzed:** 13 (7 new, 6 modified)
**Analogs found:** 11 / 13

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `apps/web/app/api/cron/digest/route.ts` | new | controller (cron route) | request-response | `apps/web/app/api/cron/scheduled-actions/route.ts` | exact |
| `apps/web/utils/digest/run-daily-digest.ts` | new | service (orchestrator) | batch | `apps/web/app/api/resend/digest/route.ts` (lines 185-387, processDigest body) | role-match |
| `apps/web/utils/digest/pending-items.ts` | new | service (DB query) | request-response | `apps/web/app/api/resend/digest/route.ts` (lines 130-184, pending fetch) | exact |
| `apps/web/utils/digest/digest-send.ts` | new | service (idempotency) | CRUD | `apps/web/utils/scheduled-actions/scheduler.ts` (`markQStashActionAsExecuting`) | role-match |
| `apps/web/utils/digest/today-et.ts` | new | utility | transform | none — Intl.DateTimeFormat one-liner | no analog |
| `apps/web/utils/ai/digest/generate-digest-content.ts` | new | service (LLM) | request-response | `apps/web/utils/ai/digest/summarize-email-for-digest.ts` | exact |
| `apps/web/utils/ai/digest/digest-prompt.ts` | new | utility (prompt) | transform | `apps/web/utils/ai/digest/summarize-email-for-digest.ts` (system string lines 31-68) | exact |
| `apps/web/utils/ai/digest/digest-schema.ts` | new | model (zod) | transform | `apps/web/utils/ai/digest/summarize-email-for-digest.ts` (lines 12-15) | exact |
| `apps/web/prisma/migrations/<ts>_add_digest_send/migration.sql` | new | migration | CRUD | `apps/web/prisma/migrations/20250616122919_add_digest/migration.sql` (CREATE TABLE Digest) | exact |
| `apps/web/prisma/schema.prisma` | mod | model | — | (existing Digest/DigestItem models lines 287-317) | self |
| `packages/resend/emails/digest-v2.tsx` | mod (already exists) | component | render | (locked visual contract; props get real data) | self |
| `apps/web/app/api/resend/digest/route.ts` | leave-as-is | controller | request-response | — | keep as fallback per RESEARCH.md "State of the Art" |
| `deploy/inbox-zero-digest.{service,timer}` | new | config (systemd) | event-driven | `deploy/inbox-zero.service` | partial-match |
| Backfill SQL (one-shot via `docker exec psql`) | new | migration (data) | CRUD | RESEARCH.md "Backfill Mechanism" inline SQL | n/a |
| Marketing rule DIGEST action seed | new | data | CRUD | none — direct INSERT or one-off `prisma.action.create` | no analog |

## Pattern Assignments

### `apps/web/app/api/cron/digest/route.ts` (controller, request-response)

**Analog:** `apps/web/app/api/cron/scheduled-actions/route.ts`

**Imports + auth pattern** (lines 1-13, 17-23):
```typescript
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";

export const maxDuration = 300;

export const GET = withError("cron/scheduled-actions", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/scheduled-actions"));
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await processScheduledActions(request.logger);
  return NextResponse.json(result);
});
```

**Bearer-secret helper** — `apps/web/utils/cron.ts` lines 4-17:
```typescript
export function hasCronSecret(request: RequestWithLogger) {
  if (!env.CRON_SECRET) {
    request.logger.error("No cron secret set, unauthorized cron request");
    return false;
  }
  const authHeader = request.headers.get("authorization");
  const valid = authHeader === `Bearer ${env.CRON_SECRET}`;
  if (!valid) request.logger.error("Unauthorized cron request:", { authHeader });
  return valid;
}
```

**Replicate:** entire GET + POST handler shape, `withError("cron/digest", ...)`, both auth paths, `maxDuration=300`.
**Adapt:** drop the `if (env.QSTASH_TOKEN)` skip-fallback (Phase 4 uses systemd, not QStash); call `runDailyDigest(request.logger)` instead of `processScheduledActions`.

---

### `apps/web/utils/digest/run-daily-digest.ts` (orchestrator service)

**Analog:** `apps/web/app/api/resend/digest/route.ts` (the `processDigest` body, lines 130-387)

**Pending-items query + state transition pattern** (lines 130-197):
```typescript
const pendingDigests = await prisma.digest.findMany({
  where: { emailAccountId, status: DigestStatus.PENDING },
  include: { items: { include: { action: { include: { executedRule: { include: { rule: { select: { name: true } } } } } } } } },
});
if (pendingDigests.length) {
  await prisma.digest.updateMany({
    where: { id: { in: pendingDigests.map((d) => d.id) } },
    data: { status: DigestStatus.PROCESSING },
  });
}
```

**Gmail batch fetch with rate-limit pacing** (lines 228-243):
```typescript
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

**Transactional success commit** (lines 336-369):
```typescript
await prisma.$transaction([
  prisma.digest.updateMany({
    where: { id: { in: processedDigestIds } },
    data: { status: DigestStatus.SENT, sentAt: new Date() },
  }),
  prisma.digestItem.updateMany({
    data: { content: "[REDACTED]" },
    where: { digestId: { in: processedDigestIds } },
  }),
  // PHASE 4 ADDITION:
  // prisma.digestSend.create({ data: { date: todayET, itemCount, ... } }),
]);
```

**Failure rollback** (lines 370-384):
```typescript
} catch (error) {
  await prisma.digest.updateMany({
    where: { id: { in: pendingDigests.map((d) => d.id) } },
    data: { status: DigestStatus.FAILED },
  });
  logger.error("Error sending digest email", { error });
  captureException(error);
  throw new SafeError("Error sending digest email", 500);
}
```

**Replicate:** the four-step state machine (PENDING → PROCESSING → SENT/FAILED), the batch-fetch loop with 2s sleep, the `$transaction` atomic commit, the catch-rollback shape.
**Adapt:** (1) drop `digestScheduleData`/`digestScheduleProgression` machinery — single-tenant, no `Schedule` table dependency (per RESEARCH.md anti-patterns); (2) bucket items by ruleName into `urgent/uncertain/receipts/newsletters/marketing/notifications` instead of camelCase ruleNameMap; (3) call `generateDigestContent(...)` once instead of per-item summary; (4) merge Sonnet output with `messageMap` (sender/subject) into typed `DigestV2Props`; (5) add `prisma.digestSend.create({...})` to the transaction; (6) check `DigestSend` exists for `todayET` first → idempotency skip.

---

### `apps/web/utils/digest/digest-send.ts` (idempotency helper, CRUD)

**Analog:** none-exact; closest pattern is `prisma.digestSend.findUnique` + create.

**Pattern (synthesize from RESEARCH.md DigestSend Table Design + standard prisma ops):**
```typescript
export async function digestAlreadySentToday(emailAccountId: string, todayET: Date) {
  return await prisma.digestSend.findUnique({
    where: { emailAccountId_date: { emailAccountId, date: todayET } },
  });
}
```

**Replicate:** `findUnique` on the composite `@@unique([emailAccountId, date])` index from the new schema.
**Adapt:** none — straightforward Prisma usage.

---

### `apps/web/utils/digest/today-et.ts` (utility, transform)

**No analog.** Use `Intl.DateTimeFormat` directly per RESEARCH.md DigestSend Table Design:
```typescript
export function getTodayET(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return new Date(ymd); // "2026-05-04" → Date at UTC midnight
}
```

---

### `apps/web/utils/ai/digest/generate-digest-content.ts` (LLM service)

**Analog:** `apps/web/utils/ai/digest/summarize-email-for-digest.ts`

**Imports + zod schema pattern** (lines 1-15):
```typescript
import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const schema = z.object({
  content: z.string().describe("The content of the summary text"),
});
type AISummarizeResult = z.infer<typeof schema>;
```

**createGenerateObject call shape** (lines 80-97):
```typescript
const modelOptions = getModel(emailAccount.user, "economy");
const generateObject = createGenerateObject({
  emailAccount,
  label: "Summarize email",
  modelOptions,
  promptHardening: { trust: "untrusted", level: "compact" },
});
const aiResponse = await generateObject({
  ...modelOptions,
  system,
  prompt,
  schema,
});
return aiResponse.object;
```

**Replicate:** import set, `createGenerateObject` invocation shape, try/catch + `logger.error` recovery.
**Adapt:** (1) `getModel(emailAccount.user, "default")` — Sonnet, NOT economy (per CONTEXT.md D-03 personality requires Sonnet); (2) `label: "digest-batch-content"`; (3) `promptHardening.level: "full"` (CLAUDE.md mandate for new code per RESEARCH.md Pattern 2 note); (4) richer zod schema (narrativeGreeting/narrativeBody/urgent[]/uncertain[]/autoFiled.{receipts,newsletters,marketing,notifications}) — full shape in RESEARCH.md lines 558-591; (5) on failure, throw rather than return null (digest can't render without it).

---

### `apps/web/utils/ai/digest/digest-prompt.ts` (utility, transform)

**Analog:** `apps/web/utils/ai/digest/summarize-email-for-digest.ts` (the `system` string lines 31-68 demonstrates structured-bullet system prompt convention).

Skeleton already provided in RESEARCH.md lines 632-668 (DIGEST_SYSTEM_PROMPT with VOICE / SECTION TONE RULES / HARD GUARDRAIL / HOLIDAY HANDLING / CLUSTERING / LENGTH BUDGET sections).

**Replicate:** layered-section format with explicit DO / DO NOT directives.
**Adapt:** Phase 4 adds tone guardrails (D-04 grief/distress) and clustering rules (D-06/D-18 Deals prefix).

---

### `apps/web/prisma/migrations/<ts>_add_digest_send/migration.sql`

**Analog:** `apps/web/prisma/migrations/20250616122919_add_digest/migration.sql`

**CREATE TABLE pattern** (lines 21-30, 63-64, 76):
```sql
-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "DigestStatus" NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Digest_emailAccountId_idx" ON "Digest"("emailAccountId");
-- AddForeignKey
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_emailAccountId_fkey"
  FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Replicate:** id/createdAt/updatedAt scaffolding + emailAccountId FK with `ON DELETE CASCADE`, named indices.
**Adapt:** add `date DATE NOT NULL`, `itemCount INTEGER`, `tokenCountInput/Output`, `modelUsed TEXT`, `narrativeSnapshot TEXT`, `digestIds TEXT[]`, `resendMessageId TEXT`; unique compound index `(emailAccountId, date)`. **Do NOT** add a `SENDING` enum value — RESEARCH.md confirms `PROCESSING` already exists and is functionally equivalent.
**Generate via:** `cd apps/web && pnpm prisma migrate dev --name add_digest_send` after editing schema.prisma.

---

### `deploy/inbox-zero-digest.timer` + `inbox-zero-digest.service` (systemd, event-driven)

**Analog:** `deploy/inbox-zero.service` (lines 1-17 — only existing systemd unit in `deploy/`):
```ini
[Unit]
Description=Inbox Zero
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/inbox-zero
ExecStartPre=/opt/inbox-zero/load-secrets.sh
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
```

**Replicate:** `[Unit]/[Service]/[Install]` block layout; `Type=oneshot`; reading env via `EnvironmentFile=/opt/inbox-zero/.env` (matches `load-secrets.sh` output target per CLAUDE.md).
**Adapt:** RESEARCH.md lines 717-729 has the complete spec —
```ini
# inbox-zero-digest.timer
[Timer]
OnCalendar=*-*-* 09:00:00 America/New_York
Persistent=true
[Install]
WantedBy=timers.target

# inbox-zero-digest.service
[Service]
Type=oneshot
EnvironmentFile=/opt/inbox-zero/.env
ExecStart=/usr/bin/curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" https://inbox.tdfurn.com/api/cron/digest
```

---

### Backfill SQL (one-shot, run via `docker exec psql`)

**Analog:** none in repo (one-off ops). Spec in RESEARCH.md lines 811-833.

**Replicate:** the verify-then-update two-step pattern; ET cutoff timestamp (deploy time).
**Adapt:** target `Digest` (NOT `DigestItem`) — confirmed by RESEARCH.md schema correction (status lives on `Digest` only). One-shot SQL via memory-noted Postgres access pattern: `sudo docker exec inbox-zero-postgres psql -U inboxzero -d inboxzero -c "..."`.

---

### Marketing rule DIGEST action seed

**Analog:** none — direct DB write. Per RESEARCH.md Pitfall 5 / open-question resolution 2.

**Pattern:**
```sql
INSERT INTO "Action" (id, type, "ruleId", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'DIGEST',
  (SELECT id FROM "Rule" WHERE "systemType" = 'MARKETING' AND "emailAccountId" = '<rebekah-id>'),
  NOW(), NOW());
```

**Adapt:** verify-first via `SELECT type FROM "Action" WHERE "ruleId" IN (SELECT id FROM "Rule" WHERE "systemType"='MARKETING');` before inserting (idempotency).

---

## Shared Patterns

### Logging
**Source:** `apps/web/app/api/cron/scheduled-actions/route.ts` lines 82-85
```typescript
const actionLogger = logger.with({
  scheduledActionId: scheduledAction.id,
  emailAccountId: scheduledAction.emailAccountId,
});
```
**Apply to:** `run-daily-digest.ts`, `generate-digest-content.ts`, `digest-send.ts`. Always derive scoped logger with `emailAccountId` + a Phase-4-specific id (e.g. `digestSendId`, `digestId`).

### Error capture
**Source:** `apps/web/app/api/cron/scheduled-actions/route.ts` line 19, `apps/web/app/api/resend/digest/route.ts` line 382
```typescript
captureException(new Error("Unauthorized request: api/cron/digest"));
// ...
logger.error("Error sending digest email", { error });
captureException(error);
```
**Apply to:** every catch block in `run-daily-digest.ts`; auth-failure branch in `route.ts`.

### LLM call hardening
**Source:** RESEARCH.md Pattern 2 + CLAUDE.md note (line 322 of RESEARCH.md)
**Apply to:** all new LLM calls — `promptHardening: { trust: "untrusted", level: "full" }` (NOT `compact` like the legacy `summarize-email-for-digest.ts`).

### Email send + render
**Source:** `apps/web/utils/digest/send-digest.ts` lines 180-191
```typescript
await sendDigestEmail({
  from: env.RESEND_FROM_EMAIL,
  to: userEmail,
  emailProps: { /* ... */ },
});
```
**Apply to:** `run-daily-digest.ts` final send step. **Adapt:** `@inboxzero/resend.sendDigestEmail` currently wraps `digest.tsx`; Phase 4 either (a) extends `packages/resend` with a parallel `sendDigestV2Email` wrapping `digest-v2.tsx`, or (b) calls `render(<DigestV2 ... />)` from `@react-email/render` inline and uses Resend SDK directly. Plan-phase decision; (a) preferred for consistency.

### Prisma `$transaction` atomicity
**Source:** `apps/web/app/api/resend/digest/route.ts` lines 336-369
**Apply to:** the SENT-commit step in `run-daily-digest.ts`. Bundle: Digest update + DigestItem redact + DigestSend create — all-or-nothing.

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `apps/web/utils/digest/today-et.ts` | TZ utility | Trivial Intl one-liner; no project precedent for ET-anchored date math |
| Marketing rule DIGEST action seed | data | One-off; not a recurring code pattern |
| Backfill SQL | data migration | One-off ops script, not a code-tree artifact |

## Metadata

**Analog search scope:**
- `apps/web/app/api/cron/**` (cron route patterns)
- `apps/web/app/api/resend/digest/**` (existing send pipeline)
- `apps/web/utils/digest/**` (helpers)
- `apps/web/utils/ai/digest/**` (LLM call patterns)
- `apps/web/prisma/migrations/**` (table-creation migrations)
- `deploy/**` (systemd unit patterns)
- `apps/web/utils/cron.ts` (auth helper)

**Files scanned:** 12 source/migration files read; ~30 directories surveyed via Glob/Grep.

**Pattern extraction date:** 2026-05-04
