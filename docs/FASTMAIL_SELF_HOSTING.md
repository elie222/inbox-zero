# Fastmail: architecture, reviewer setup, and self-hosting

Fastmail mail uses a JMAP API token. Calendars use a separate CalDAV app password.
Application sign-in is separate from mailbox connection: Google and Microsoft
remain available, and self-hosters can optionally configure Authelia OIDC.

## Why these changes belong together

A usable provider needs sign-in, mailbox connection, onboarding, search, rule
execution, and continued processing after missed notifications or a restart.
Connecting a token alone does not deliver automatic inbox organization. This
contribution therefore includes the provider implementation and the shared
account, mail-engine, queue, worker, and synchronization changes it requires.

Authelia provides a sign-in option for installations without Google or Microsoft
OAuth credentials. It does not grant Fastmail access; users connect their own
Fastmail token after signing in. CalDAV completes the calendar availability,
invitation, and booking features already exposed to other providers. Both are
optional and disabled until configured. Their boundaries are explicit, so this
can be split into coordinated contributions if the maintainer prefers.

Generic IMAP, unrelated integrations, and fork deployment CI are outside this
contribution. Existing Gmail and Outlook flows continue through their existing
provider implementations.

## Notification and recovery architecture

```mermaid
flowchart LR
  S[Fastmail SSE] --> L[One listener per token]
  L --> H[Authenticated internal webhook]
  H --> Q[BullMQ / Redis]
  P[Independent five-minute poll] --> Q
  Q --> W[Worker]
  W --> R[Authenticated processing route]
  R --> J[JMAP changes / recovery query]
  J --> D[PostgreSQL pending messages and cursor]
  D --> A[Existing rule processing]
```

The listener obtains account configuration from an authenticated, non-cacheable
internal endpoint. Neither tokens nor message contents belong in ordinary logs.
The webhook acknowledges only after Redis accepts the job. The worker calls the
internal processing route; PostgreSQL holds account leases, change cursors, and
durable pending message IDs. Intake stores pending IDs and advances the cursor
atomically. Failed processing leaves pending work available for a later attempt.

Initial connection records a baseline rather than treating the entire historical
mailbox as new mail. An expired JMAP cursor triggers a recovery query from the
recorded synchronization start time. Independent polling runs every 300 seconds,
including when SSE cannot connect. Settings exposes pending work and manual sync.
Redis is transport; PostgreSQL is the durable pending-message source of truth.
Delivery is at least once, not a guarantee of exactly-once external side effects.

**Run only one active listener for each Fastmail token.** Concurrent local and
another deployment's listeners previously caused repeated disconnects. Local QA
must use a dedicated test account/token. Do not reuse a deployment's credentials.
Reconnect uses exponential backoff with jitter, capped at five minutes; short
connections do not reset the delay. A stable connection or token rotation resets
backoff. The worker and recovery poll must run independently of that listener.

## Fresh isolated reviewer environment

Use the versions pinned in `package.json` and `.nvmrc`: Node 24 and pnpm 11.19.0. This patch was tested with Node 24.21.0.
Docker Compose is required for the local PostgreSQL and Redis services. Start in
a fresh checkout/worktree. The example ports must be unused; change all matching
URLs if necessary. These instructions use synthetic authentication and mail,
with no Fastmail credentials.

```sh
pnpm install --frozen-lockfile
mkdir -p .context/fastmail-review
chmod 700 .context/fastmail-review
```

Generate private files with random secrets. This command refuses to overwrite an
existing `.env.local`. `.context/` and `.env.local` are ignored by Git.

```sh
node <<'JS'
const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const secret = () => randomBytes(32).toString('hex');
const dbPassword = secret();
const redisHttpToken = secret();
const database = `postgresql://postgres:${dbPassword}@127.0.0.1:55432/inboxzero_local?schema=public`;
const values = {
  DATABASE_URL: database, DIRECT_URL: database,
  NEXT_PUBLIC_BASE_URL: 'http://localhost:3100',
  AUTH_SECRET: secret(), EMAIL_ENCRYPT_SECRET: secret(), EMAIL_ENCRYPT_SALT: secret(),
  API_KEY_SALT: secret(), INTERNAL_API_KEY: secret(), FASTMAIL_WEBHOOK_SECRET: secret(), CRON_SECRET: secret(),
  INTERNAL_API_URL: 'http://127.0.0.1:3100', QUEUE_BACKEND: 'bullmq',
  REDIS_URL: 'redis://127.0.0.1:56379', REDIS_HTTP_URL: 'http://127.0.0.1:58079', REDIS_HTTP_TOKEN: redisHttpToken,
  GOOGLE_BASE_URL: 'http://localhost:3102', GOOGLE_CLIENT_ID: 'emulate-google-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'emulate-google-secret',
  GOOGLE_PUBSUB_TOPIC_NAME: 'fixture-topic', GOOGLE_PUBSUB_VERIFICATION_TOKEN: 'fixture-verification',
  DEFAULT_LLMS: 'openai-compatible:emulated', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:3104/v1',
  NEXT_PUBLIC_FASTMAIL_ENABLED: 'true', NEXT_PUBLIC_EMAIL_SEND_ENABLED: 'true', NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: 'true',
};
const env = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
writeFileSync('apps/web/.env.local', env, { mode: 0o600, flag: 'wx' });
writeFileSync('.context/fastmail-review/services.env', `LOCAL_POSTGRES_PASSWORD=${dbPassword}\nLOCAL_POSTGRES_PORT=55432\nLOCAL_REDIS_PORT=56379\nREDIS_HTTP_TOKEN=${redisHttpToken}\n`, { mode: 0o600, flag: 'wx' });
JS
# The pinned OAuth emulator has no CLI host option; restrict its listeners.
cat > .context/fastmail-review/loopback-preload.cjs <<'JS'
const { Server } = require('node:net');
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'object' && args[0] !== null && !args[0].path) {
    args[0] = { ...args[0], host: '127.0.0.1' };
  } else if (typeof args[0] === 'number') {
    if (args[1] === undefined) args[1] = '127.0.0.1';
    else if (typeof args[1] !== 'string') args.splice(1, 0, '127.0.0.1');
  }
  return listen.apply(this, args);
};
JS
cat > .context/fastmail-review/redis-http.yml <<'YAML'
services:
  redis:
    command: [redis-server, --appendonly, 'yes']
  redis-http:
    image: hiett/serverless-redis-http:latest
    environment:
      SRH_MODE: env
      SRH_TOKEN: ${REDIS_HTTP_TOKEN}
      SRH_CONNECTION_STRING: redis://redis:6379
    ports:
      - '127.0.0.1:58079:80'
    depends_on:
      - redis
YAML
docker compose -p inboxzero-fastmail-review --env-file .context/fastmail-review/services.env \
  -f docker-compose.local.yml -f .context/fastmail-review/redis-http.yml up -d
pnpm --filter inbox-zero-ai prisma:migrate:local
cp apps/web/.env.local apps/web/.env.test
chmod 600 apps/web/.env.test
```

The Compose project has its own PostgreSQL volume. Local Redis is disposable and
bound to loopback; PostgreSQL pending work survives Redis loss. Production Redis
should use persistent storage. The HTTP Redis bridge is required by shared cache
code; BullMQ uses `REDIS_URL` directly.

Migration `20261004010000_fastmail_selfhosted` adds the polling timestamp,
synchronization baseline/lease/recovery fields, `FastmailSyncItem`,
`FastmailDraft`, and CalDAV credential/read-only fields. Apply all repository
migrations, not just this one. Keep encryption secrets stable across restarts:
stored API tokens and calendar app passwords use the existing encryption layer.

## Automated checks without a live account

```sh
pnpm test utils/fastmail utils/email/fastmail.test.ts utils/calendar/providers/fastmail.test.ts \
  utils/actions/fastmail-app-token.test.ts app/api/fastmail \
  app/api/user/onboarding/processed-emails/route.test.ts \
  utils/email/provider-health.test.ts utils/oauth/login-providers.test.ts
pnpm --filter inbox-zero-fastmail-eventsource-daemon test
pnpm --filter inbox-zero-fastmail-eventsource-daemon typecheck
pnpm --filter @inboxzero/mail-sqlite test --run src/migrations.test.ts
pnpm --filter inbox-zero-ai exec dotenv -e .env.local -- \
  env NODE_OPTIONS="--require ../../.context/fastmail-review/loopback-preload.cjs" \
    GOOGLE_CLIENT_ID=client_id GOOGLE_CLIENT_SECRET=client_secret pnpm test:playwright:emulated fastmail/fastmail-core.spec.ts
pnpm --filter inbox-zero-ai exec dotenv -e .env.local -- \
  env NODE_OPTIONS="--require ../../.context/fastmail-review/loopback-preload.cjs" \
    GOOGLE_CLIENT_ID=client_id GOOGLE_CLIENT_SECRET=client_secret pnpm test:playwright:emulated onboarding/control-onboarding.spec.ts onboarding/processing-results.spec.ts
```

The browser harness starts its own Google auth, LLM, Stripe, and Fastmail fixtures.
Expected Fastmail results: connection succeeds, the inbox shows two synthetic
messages, and searching `Safety` returns only `Safety receipt`. The same spec
starts the real BullMQ worker, inserts synthetic pending work, and verifies an
archiving rule runs through both the authenticated webhook and the independent
poll, with no SSE listener running. It requires the isolated PostgreSQL and
Redis services above. Screenshots are
written under `apps/web/test-results/`. Inspect the account and search checkpoints.
The onboarding flow must reach **Inbox processing results**, not claim all mail
was processed while results are empty, loading, or unavailable. Fixtures exercise
our integration contract; they do not certify Fastmail's live service.

Database tests must use a **separate disposable database**. Create it and write
`.env.db` with URLs pointing to that database (never a shared database):

```sh
docker compose -p inboxzero-fastmail-review --env-file .context/fastmail-review/services.env \
  -f docker-compose.local.yml -f .context/fastmail-review/redis-http.yml \
  exec -T db createdb -U postgres inboxzero_fastmail_db_tests
node <<'JS'
const { readFileSync, writeFileSync } = require('node:fs');
const env = readFileSync('apps/web/.env.local', 'utf8').replaceAll('/inboxzero_local?', '/inboxzero_fastmail_db_tests?');
writeFileSync('apps/web/.env.db', env, { mode: 0o600, flag: 'wx' });
JS
(
  # Vitest explicitly loads .env.test, so swap it for this disposable database.
  cp apps/web/.env.test .context/fastmail-review/unit-test.env
  trap 'mv .context/fastmail-review/unit-test.env apps/web/.env.test' EXIT
  cp apps/web/.env.db apps/web/.env.test
  pnpm --filter inbox-zero-ai exec dotenv -e .env.db -- prisma migrate deploy
  pnpm --filter inbox-zero-ai exec dotenv -e .env.db -- pnpm test-db __tests__/db/fastmail-sync.test.ts
)
```

Expected: lease contention admits one owner, a failed intake transaction does not
advance the cursor, duplicate pending items are deduplicated, draft replacement
checks its version, and calendar credentials are encrypted at rest.

## Manual app startup with emulated sign-in

For browser-driven fixture QA, prefer the harness above. For an interactive local
app, generate an auth seed and run each long-lived command in its own terminal:

```sh
pnpm --filter inbox-zero-ai exec tsx scripts/write-emulate-seed.ts \
  --base-url http://localhost:3100 --output .context/fastmail-review/auth-seed.json
pnpm --filter inbox-zero-ai exec node --require ../../.context/fastmail-review/loopback-preload.cjs \
  node_modules/emulate/dist/index.js start --service google --port 3102 \
  --seed ../../.context/fastmail-review/auth-seed.json
pnpm --filter inbox-zero-ai exec tsx scripts/run-llm-emulator.ts 3104
pnpm --filter inbox-zero-ai exec next dev --hostname 127.0.0.1 --port 3100
pnpm --filter inbox-zero-ai exec dotenv -e .env.local -- pnpm --dir ../worker start
```

Open `http://localhost:3100` and sign in with the synthetic Google identity. The
LLM emulator returns canned output suitable for UI checks, not real rule-quality
assessment. Use configured real AI providers only for dedicated live QA.

## Dedicated live Fastmail QA

Create a dedicated Fastmail test account and a new API token in Fastmail's
**Settings → Privacy & Security → Integrations → API tokens**. Grant **Email**
read/write and sending access. Connection requires writable mail and the JMAP
submission capability. Contacts permission is optional for contact features.
Read-only and draft-only tokens are not supported; do not use a production token.

Sign into Inbox Zero, open **Accounts → Add Fastmail**, and enter the token. The
account should appear and its inbox/search should work. Reconnect from account
settings when rotating/revoking a token; reconnect must preserve pending work and
must not allow another user's mailbox to be claimed.

For calendars, create a **separate Fastmail app password with Calendar access**.
Open Calendars, connect Fastmail, and select calendars. Existing calendar
selections should survive reconnect; read-only calendars can be read for
availability but cannot be selected for booking writes. A JMAP token is not a
CalDAV password.

Optional Authelia configuration (replace the example issuer and keep the secret
in the ignored environment file):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_AUTHELIA_ENABLED` | `true` |
| `AUTHELIA_CLIENT_ID` | Your registered OIDC client ID |
| `AUTHELIA_CLIENT_SECRET` | Your OIDC client secret |
| `AUTHELIA_ISSUER_URL` | `https://auth.example.com` |

Register `${NEXT_PUBLIC_BASE_URL}/api/auth/callback/authelia` as the redirect URI
with `openid profile email` scopes and PKCE support. Better Auth's generic OAuth
plugin registers this provider for `signIn.social`. After sign-in, accounts with
no mailbox are sent to Accounts to connect one. Google/Microsoft OAuth credentials
are optional when Authelia is configured; their flows remain available when set.

Start the listener **only after confirming this test token has no other active
listener**. Put `MAIN_APP_URL=http://127.0.0.1:3100`, `INTERNAL_API_KEY`, and
`FASTMAIL_WEBHOOK_SECRET` in an ignored private file. The latter two values must
match the app's environment. The listener retrieves tokens through the internal
account endpoint; do not put a Fastmail token in its configuration.

```sh
pnpm --filter inbox-zero-ai exec dotenv -e ../../.context/fastmail-review/listener.env -- \
  pnpm --dir ../fastmail-eventsource-daemon dev
```

Run independent recovery polling in another terminal. Requests are bounded; the
script prints only HTTP status and exits on Ctrl-C.

```sh
pnpm --filter inbox-zero-ai exec dotenv -e .env.local -- node --input-type=module <<'JS'
const poll = async () => {
  try {
    const response = await fetch(`${process.env.INTERNAL_API_URL}/api/fastmail/poll`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(60_000),
    });
    console.log(`Fastmail recovery HTTP ${response.status}`);
  } catch { console.error('Fastmail recovery request failed'); }
};
await poll();
const timer = setInterval(poll, 300_000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); process.exit(0); });
JS
```

Verify ordinary text/sender/date/folder searches, onboarding counts, and an
explicit test archiving rule. Send only synthetic mail to the dedicated account.
Then stop the listener, deliver a message, and confirm the independent poll still
queues and processes it. Restart the worker during pending work and verify
PostgreSQL pending items drain. Exercise a reconnect storm and token rotation:
short connections should increase backoff, and no other deployment should be
involved. Test sending/drafts/attachments and calendar writes separately.

## Container deployment

Use web and worker images built from the same commit as the listener. The default
Compose images remain upstream images; an older published image does not contain
these routes. Build local images and use a private override for web/worker image
tags and loopback-bound ports. Do not modify an existing deployment for QA.

```sh
docker build -f docker/Dockerfile.prod -t inbox-zero-fastmail-review:local .
docker build -f apps/fastmail-eventsource-daemon/Dockerfile -t inbox-zero-fastmail-daemon:local .
```

Set `QUEUE_BACKEND=bullmq`, `REDIS_URL`, `INTERNAL_API_KEY`,
`FASTMAIL_WEBHOOK_SECRET`, `CRON_SECRET`, and `NEXT_PUBLIC_FASTMAIL_ENABLED=true`.
Enable the `fastmail` profile alongside the database/cache/cron services (the
`all` profile includes those). The profile includes the worker and listener.
If overriding `WORKER_QUEUES`, include `fastmail-sync`. The Compose cron adds an
independent 300-second recovery loop. Verify migrations completed before testing;
service startup alone is not proof that migrations succeeded.

## Validation and limitations

Fresh checks on the upstream adaptation (2026-10-04, base `ed5f8de1a`):

| Check | Result |
| --- | --- |
| Focused web regression suite | 399 tests in 30 files passed |
| EventSource listener | 5 tests and package typecheck passed |
| Mail core | 47 tests and package typecheck passed |
| Mail SQLite | 175 tests passed, 2 skipped; package typecheck passed (includes 3 migration regressions) |
| Disposable PostgreSQL | 5 durable-state/encryption tests passed; all migrations applied on fresh databases |
| Browser fixtures | 8 feature scenarios passed across Fastmail, four processing-result states, and both existing onboarding flows; auth setup also passed |
| Real local pipeline | Webhook and independent polling queued BullMQ jobs; the real worker drained PostgreSQL pending work and archived both JMAP fixture messages |
| Repository checks | Biome on changed code, safe action exports, safe client redirects, and Prisma enum import check passed |

Connection, search, calendar form, onboarding results, and upgrade screenshots were
inspected. Browser fixtures and the real local pipeline use synthetic messages,
not a live Fastmail account. No full local app build was run; upstream CI performs
that check. A real Authelia login round trip has not been checked on this patch.


- Automated tests cover JMAP operations/search, durable intake/recovery and rule
  dispatch, account ownership/token rotation, internal authentication/queue
  acknowledgement, CalDAV, and listener backoff. Real PostgreSQL tests and fixture
  browser checks are separate from live-account checks.
- Draft-only tokens remain unimplemented: [fork issue #7](https://github.com/marcodejongh/inbox-zero/issues/7).
  Fastmail-native filter/forwarding APIs and provider-specific category/color
  features are unsupported. Ambiguous sends are not automatically retried;
  inspect Sent before retrying a send whose outcome is uncertain.
- CalDAV cannot create Google Meet or Teams conference URLs. This contribution
  uses API tokens, not Fastmail OAuth (which requires separate registration).
- Earlier fork validation (89 focused web tests, five listener tests, live search
  and automatic archiving) and continued self-hosted use are supporting evidence,
  not validation of this adapted upstream patch.
- Fresh live-account QA of this upstream adaptation is pending. Live sending,
  attachments, calendar writes, the real Authelia login round trip, and combined
  listener/worker outage recovery must
  be checked with a dedicated account before treating this as production-ready.

Protocol references: [Fastmail developer guide](https://www.fastmail.com/dev/),
[JMAP core](https://www.rfc-editor.org/rfc/rfc8620), and
[Better Auth generic OAuth](https://www.better-auth.com/docs/plugins/generic-oauth).
