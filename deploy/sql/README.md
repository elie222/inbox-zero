# One-shot SQL (Phase 4)

These SQL files are idempotent and committed for audit trail. Each filename starts with the date authored.

## Run order at Phase 4 deploy

1. **Confirm DigestSend migration is deployed** (`pnpm prisma migrate deploy` ran in build step, table exists)
2. **Run Marketing DIGEST-action seed:**
   ```bash
   sudo docker exec -i inbox-zero-postgres psql -U inboxzero -d inboxzero \
     -f - < deploy/sql/2026-05-04-add-marketing-digest-action.sql
   ```
   Verify: `psql -c "SELECT a.type, r.name FROM \"Action\" a JOIN \"Rule\" r ON r.id=a.\"ruleId\" WHERE r.\"systemType\"='MARKETING';"` shows DIGEST in the type column.

3. **Update the cutoff timestamp** in `2026-05-04-backfill-218-digests.sql` to the actual deploy time (UTC) if running after 2026-05-04 14:00 UTC.

4. **Run 218-row backfill:**
   ```bash
   sudo docker exec -i inbox-zero-postgres psql -U inboxzero -d inboxzero \
     -f - < deploy/sql/2026-05-04-backfill-218-digests.sql
   ```
   Verify: `psql -c "SELECT count(*) FROM \"Digest\" WHERE status != 'SENT' AND \"createdAt\" < '<cutoff>';"` returns 0.

5. **Verify systemd timer not yet enabled** — must NOT enable the digest timer until backfill is committed (per RESEARCH.md Pitfall 7: backfill races with active cron).

## Re-running

Both files are idempotent. Re-running is safe:
- Marketing seed: `WHERE NOT EXISTS` skips if DIGEST action already present
- Backfill: `WHERE status != 'SENT'` skips already-marked rows
