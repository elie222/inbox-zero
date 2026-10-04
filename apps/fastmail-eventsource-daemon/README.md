# Fastmail EventSource daemon

This service receives JMAP EventSource (SSE) notifications and asks the web application to enqueue account synchronization. It needs no database access. The web application decrypts API tokens through its normal credential layer and returns them only to the authenticated internal configuration endpoint.

Run from the repository root with Node 24 and pnpm 11.19:

```sh
pnpm --filter inbox-zero-fastmail-eventsource-daemon build
pnpm --filter inbox-zero-fastmail-eventsource-daemon start
```

Set `MAIN_APP_URL`, `INTERNAL_API_KEY`, and `FASTMAIL_WEBHOOK_SECRET` as described in `.env.example`. Keep the internal API key private. Build the container from the repository root:

```sh
docker build -f apps/fastmail-eventsource-daemon/Dockerfile -t inbox-zero-fastmail-daemon .
```

The daemon refreshes accounts every minute, reconnects after disconnects or missing heartbeats, and requests recovery on every connection. Webhook delivery is bounded and retried; the independent five-minute cron poll recovers missed notifications even when the daemon is offline. The web application commits incoming message IDs and the JMAP cursor together before processing work. Failed items remain pending for retry.

**Run one active listener per Fastmail token. Use a dedicated account/token for local QA, never credentials used by another deployment.**

See [Fastmail self-hosting](../../docs/FASTMAIL_SELF_HOSTING.md) for the full deployment and release checks.
