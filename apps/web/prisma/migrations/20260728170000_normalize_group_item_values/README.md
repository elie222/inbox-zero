# Recover group item normalization

The original SQL used `\v`, which PostgreSQL 15 interprets as the literal letter
`v`. The corrected SQL uses the portable octal escape `\013` for vertical tab.

Changing this file does not rerun a completed migration or clear a recorded
failure. Use this procedure for an affected database, including databases where
the original migration completed successfully.

Run from `apps/web` with `DIRECT_URL` set to a writable, direct connection to the
affected database. Ensure Prisma's configured migration URL points to the same
database; preview URL variables take precedence over `DIRECT_URL`.

1. Check migration history with `pnpm exec prisma migrate status`.
2. Apply the corrected SQL atomically. The lock prevents concurrent pattern
   writes between deduplication and normalization; a lock timeout leaves the
   database unchanged and allows a later retry.

   ```sh
   {
     printf '%s\n' "SET LOCAL lock_timeout = '5s';" 'LOCK TABLE "GroupItem" IN SHARE ROW EXCLUSIVE MODE;'
     cat prisma/migrations/20260728170000_normalize_group_item_values/migration.sql
   } | psql "$DIRECT_URL" -X --single-transaction -v ON_ERROR_STOP=1
   ```

3. **Only if the SQL succeeds and Prisma recorded this migration as failed**, mark
   it applied:

   ```sh
   pnpm exec prisma migrate resolve --applied 20260728170000_normalize_group_item_values
   ```

   Skip this step if the migration was already successfully applied.
4. Run `pnpm exec prisma migrate status` again, then deploy normally to apply any
   pending migrations.

The corrected SQL is safe to rerun: it trims whitespace, removes empty values,
and deduplicates normalized patterns using the migration's ownership and recency
priorities. It cannot reconstruct letters stripped or records deleted by an
already-successful run of the original SQL. Recover those from a backup if needed;
do not guess original values. Do not delete migration history or mark a failed
migration applied before its SQL completes successfully.
