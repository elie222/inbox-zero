# 04-06 SUMMARY — systemd timer for daily 9am ET digest

## Delivered (Task 1)

| Outcome | Commit |
|---------|--------|
| systemd service + timer + install README authored under `deploy/systemd/` | `3edee1011` |

## Files

- `deploy/systemd/inbox-zero-digest.service` — `Type=oneshot` curl; reads `CRON_SECRET` from `EnvironmentFile=/opt/inbox-zero/.env`; logs to journal
- `deploy/systemd/inbox-zero-digest.timer` — `OnCalendar=*-*-* 09:00:00 America/New_York`; `Persistent=true`
- `deploy/systemd/README.md` — pre-flight checks + install + smoke test + observability + idempotency note

## Pending (Task 2 — operator checkpoint)

Install on EC2 after the deploy session that lands Plan 02 migration + Plan 04/05 code:

1. Pre-flight: systemd ≥249, `CRON_SECRET` in `/opt/inbox-zero/.env`, Plan 03 backfill applied
2. `sudo cp deploy/systemd/inbox-zero-digest.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload`
3. Smoke test: `sudo systemctl start inbox-zero-digest.service` → confirm email arrives, JSON shows `{ sent: true, ... }`
4. Verify `DigestSend` audit row inserted
5. Re-run smoke test → confirm `reason: "already-sent-today"` (idempotency)
6. `sudo systemctl enable --now inbox-zero-digest.timer` → `list-timers` shows tomorrow 09:00 ET
7. Day 2 async: confirm auto-fired digest arrives without manual trigger

Update this summary with the journalctl/DB/timer outputs after the deploy session.
