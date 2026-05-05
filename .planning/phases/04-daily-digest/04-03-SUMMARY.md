---
phase: 04-daily-digest
plan: 03
subsystem: deploy/sql
tags: [sql, deploy, marketing, digest, backfill]
requires: [Phase 3 D-05 Marketing rule LABEL+ARCHIVE, accumulated 218 stale Digest rows]
provides:
  - deploy/sql/2026-05-04-add-marketing-digest-action.sql
  - deploy/sql/2026-05-04-backfill-218-digests.sql
  - deploy/sql/README.md
affects: [Rule (Marketing), Action, Digest, DigestItem]
key-files:
  created:
    - deploy/sql/2026-05-04-add-marketing-digest-action.sql
    - deploy/sql/2026-05-04-backfill-218-digests.sql
    - deploy/sql/README.md
  modified: []
decisions:
  - "Source Action.emailAccountId from the parent Rule.emailAccountId in the seed INSERT (required NOT NULL column missing from the plan's draft SQL)"
  - "Drop the meaningless `content IS NOT NULL` clause in the DigestItem redaction UPDATE (column is non-nullable per schema)"
metrics:
  duration: ~10min
  completed: 2026-05-04
status: task-1-complete-task-2-deferred-to-checkpoint
---

# Phase 04 Plan 03: Marketing-rule DIGEST seed + 218-row Digest backfill — Summary

Two committed, idempotent SQL files plus a README staged under `deploy/sql/`. They are NOT yet executed against production — Task 2 is a `checkpoint:human-action` that the orchestrator hands to the operator.

## What shipped (Task 1)

1. **`deploy/sql/2026-05-04-add-marketing-digest-action.sql`** — INSERT adds a `DIGEST` Action row to the Marketing rule (`Rule.systemType = 'MARKETING'`). Idempotent via `WHERE NOT EXISTS (SELECT 1 FROM Action WHERE ruleId = r.id AND type = 'DIGEST')`. Wrapped in `BEGIN/COMMIT`.
2. **`deploy/sql/2026-05-04-backfill-218-digests.sql`** — UPDATE marks all pre-cutoff `Digest` rows as `SENT` so the first real 9am cron does not flush 218 phantom items in one fat email. Idempotent via `WHERE status != 'SENT' AND createdAt < cutoff`. Bonus UPDATE redacts stale `DigestItem.content` to `'[REDACTED]'` for hygiene. Cutoff timestamp `'2026-05-04 14:00:00+00'` left in place; operator updates per README before running.
3. **`deploy/sql/README.md`** — run order, docker-exec invocation, verification queries, re-run-safety notes.

## Schema verification (against `apps/web/prisma/schema.prisma`)

| Column / enum            | Confirmed value                                          |
| ------------------------ | -------------------------------------------------------- |
| `Rule.systemType`        | `SystemType?` enum, includes `MARKETING` (line 488/1621) |
| `Action.type`            | `ActionType` enum, includes `DIGEST` (line 503/1477)     |
| `Action.emailAccountId`  | `String` NOT NULL (line 505) — required in INSERT        |
| `Digest.status`          | `DigestStatus` enum, default `PENDING` (line 296/1632)   |
| `DigestStatus` values    | `PENDING, PROCESSING, SENT, FAILED`                      |
| `DigestItem.content`     | `String @db.Text` (line 307) — NOT nullable              |

Plan's draft SQL was updated for two correctness issues:

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `Action.emailAccountId` to seed INSERT**
- **Found during:** Task 1 schema verification.
- **Issue:** Plan's draft INSERT omitted `emailAccountId`, but the `Action` model has it as `String` (NOT NULL) per `schema.prisma:505`. The INSERT would have failed with a `null value in column "emailAccountId" violates not-null constraint`.
- **Fix:** Added `"emailAccountId"` to the column list and sourced its value from the parent `Rule.emailAccountId` (the same email account that owns the rule).
- **Files modified:** `deploy/sql/2026-05-04-add-marketing-digest-action.sql`
- **Commit:** `98e32257c`

**2. [Rule 1 - Bug] Removed meaningless `content IS NOT NULL` clause**
- **Found during:** Task 1 schema verification.
- **Issue:** Plan's hygiene UPDATE filtered with `content IS NOT NULL`, but `DigestItem.content` is non-nullable (`String @db.Text` without `?`). The clause is always true — a no-op that misleads future readers.
- **Fix:** Dropped the clause; kept the `content != '[REDACTED]'` guard which provides genuine idempotency.
- **Files modified:** `deploy/sql/2026-05-04-backfill-218-digests.sql`
- **Commit:** `98e32257c`

## Task 2 status

**Deferred to orchestrator/operator.** Task 2 is `checkpoint:human-action` — running the SQL against production Postgres on the EC2 host. This executor did not touch any database. The cutoff timestamp in the backfill SQL stays at `'2026-05-04 14:00:00+00'`; the README instructs the operator to update it to the actual deploy time before running.

## Verification

```
$ ls deploy/sql/2026-05-04-*.sql deploy/sql/README.md
deploy/sql/2026-05-04-add-marketing-digest-action.sql
deploy/sql/2026-05-04-backfill-218-digests.sql
deploy/sql/README.md

$ grep -c "WHERE NOT EXISTS\|WHERE status != 'SENT'" deploy/sql/2026-05-04-*.sql
deploy/sql/2026-05-04-add-marketing-digest-action.sql:1
deploy/sql/2026-05-04-backfill-218-digests.sql:4
```

Both idempotency guards present; `done` criteria met.

## Self-Check: PASSED

- Created files exist: confirmed via `ls`.
- Commit `98e32257c` present in `git log` on `main`.
- Schema column names verified against `apps/web/prisma/schema.prisma`.
- No production database side-effects from this executor.
