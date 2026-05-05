# Daily digest scheduler (Phase 4)

Two systemd units trigger `/api/cron/digest` at 09:00 America/New_York daily.

## Files
- `inbox-zero-digest.service` — oneshot curl to the cron endpoint with CRON_SECRET from `/opt/inbox-zero/.env`
- `inbox-zero-digest.timer` — daily 09:00 ET schedule, DST-correct, `Persistent=true` (catches up missed fires after reboot)

## Install (one-time, on the EC2 host)

Pre-flight checks:

```bash
# 1. Confirm systemd ≥249 (supports OnCalendar IANA tz suffix)
systemd --version | head -1

# 2. Confirm /opt/inbox-zero/.env contains CRON_SECRET
sudo grep -E '^CRON_SECRET=' /opt/inbox-zero/.env

# 3. Confirm Phase 4 plan 04-03 backfill has been applied (zero PENDING Digests)
sudo docker exec inbox-zero-postgres psql -U inboxzero -d inboxzero \
  -c 'SELECT count(*) FROM "Digest" WHERE status != '\''SENT'\'';'
```

Install the unit files:

```bash
sudo cp deploy/systemd/inbox-zero-digest.service /etc/systemd/system/
sudo cp deploy/systemd/inbox-zero-digest.timer  /etc/systemd/system/
sudo systemctl daemon-reload
```

**Smoke test before enabling the timer** (sends a real digest now):

```bash
sudo systemctl start inbox-zero-digest.service
sudo journalctl -u inbox-zero-digest.service -n 50 --no-pager
```

Expected: HTTP 200 + JSON body `{ "processedAccounts": 1, "results": [{ "sent": true, ... }] }`. Verify the email landed in `rebekah@trueocean.com` (subject: `Daily digest · {date}`).

If smoke test passes, enable the timer:

```bash
sudo systemctl enable --now inbox-zero-digest.timer
sudo systemctl list-timers inbox-zero-digest.timer
```

Expected: `NEXT` shows tomorrow at 09:00 ET (or today if before 9am ET).

## Observability

- `journalctl -u inbox-zero-digest.service --since '24 hours ago'` — last 24h send results
- `systemctl list-timers inbox-zero-digest.timer` — next/last fire times
- Postgres: `SELECT date, "sentAt", "itemCount", "resendMessageId" FROM "DigestSend" ORDER BY date DESC LIMIT 7;`

## Disabling

```bash
sudo systemctl disable --now inbox-zero-digest.timer
```

## Idempotency note

Re-running `systemctl start inbox-zero-digest.service` on the same ET date is safe: the cron handler short-circuits via `DigestSend.findUnique` and returns `reason: "already-sent-today"` without sending a second email. (See Plan 04-05 §runDailyDigest.)
