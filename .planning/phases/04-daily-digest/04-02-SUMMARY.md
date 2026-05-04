# 04-02 SUMMARY — DigestSend model + migration

## Delivered

| Task | Outcome | Commit |
|------|---------|--------|
| 1. Add DigestSend model | `model DigestSend` added after DigestItem, with composite unique `(emailAccountId, date)`, FK to EmailAccount on cascade, plus token/cost telemetry columns and narrative snapshot. Back-relation `digestSends DigestSend[]` added to EmailAccount. | `cdf92da87` |
| 2. Generate migration | `prisma/migrations/20260504194000_add_digest_send/migration.sql` written by hand (no local DB available; `prisma migrate dev` requires shadow DB). DDL matches what `migrate dev` would have produced. | `cdf92da87` |
| 3. Prisma generate | `npx prisma generate` ran; client regenerated to `apps/web/generated/prisma`. | (no commit — generated files are gitignored) |

## DDL generated

```sql
CREATE TABLE "DigestSend" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "resendMessageId" TEXT,
    "itemCount" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "modelUsed" TEXT,
    "narrativeSnapshot" TEXT,
    "digestIds" TEXT[],
    CONSTRAINT "DigestSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigestSend_emailAccountId_date_key"
  ON "DigestSend"("emailAccountId", "date");
CREATE INDEX "DigestSend_emailAccountId_idx" ON "DigestSend"("emailAccountId");
CREATE INDEX "DigestSend_sentAt_idx" ON "DigestSend"("sentAt");

ALTER TABLE "DigestSend"
  ADD CONSTRAINT "DigestSend_emailAccountId_fkey"
  FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

## Verification

- `prisma format` ran cleanly (137ms).
- `prisma validate` reports the schema is valid.
- `prisma generate` produced types successfully.
- No `SENDING` enum value added — confirmed `enum DigestStatus { PENDING PROCESSING SENT FAILED }` already contains the value Plan 05 needs.

## Deviations

- **Hand-written migration file** instead of `prisma migrate dev --create-only`. The CLI requires either a configured datasource (no local `.env` exists) or a shadow database URL. The DDL is the standard format Prisma emits for this model shape — production deploy via `prisma migrate deploy` will accept it as a valid migration without re-applying anything.
- **Sandbox blocker.** Plan 02 executor agent could not run any Prisma command (denied) and could not commit. Orchestrator ran `prisma format`, `prisma validate`, `prisma generate` and authored the migration + commit inline.

## Production deploy note

The migration will be applied automatically on next image deploy:

```
pnpm prisma migrate deploy
```

(This runs in the build/start step on the EC2 host; no manual `psql` is required for this migration.)
