# Open Inbox Zero: local OpenRouter setup

This optional local runner extends [Inbox Zero](https://github.com/elie222/inbox-zero).
Use the upstream hosting guides for Docker, Linux, macOS, or a cloud deployment.
The portable runner and desktop launcher documented here target Windows x64.
No credentials, installed tools, mailbox databases, or generated executables are
shipped in this repository.

## Prerequisites

Install Git for Windows and prepare the following sibling directory layout.
The paths are resolved relative to the checkout; no particular Windows username
or clone location is required.

```text
workspace/
  open-inbox-zero/                         # this checkout
  tools/
    node-v24.22.1-win-x64/node.exe
    pnpm/node_modules/pnpm/bin/pnpm.cjs     # pnpm 11.19.0
    postgresql16/pgsql/bin/                 # PostgreSQL 16 binaries
    garnet/net10.0/GarnetServer.exe         # Redis-compatible Garnet server
```

Use official [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/),
[PostgreSQL](https://www.postgresql.org/download/windows/), and
[Garnet](https://github.com/microsoft/garnet) distributions. Garnet may also need
the matching .NET runtime. Chrome or Edge and the Windows .NET Framework C#
compiler are required only for the desktop launcher.

Install workspace dependencies using the pnpm version in `package.json`, then
copy `apps/web/.env.example` to `apps/web/.env.local`. Follow the upstream hosting
instructions to fill required settings. In particular:

- Set `NEXT_PUBLIC_BASE_URL=http://localhost:3000`.
- Point `DATABASE_URL` at your own local PostgreSQL database on port 5433.
- Set `REDIS_URL=redis://127.0.0.1:6380` and
  `REDIS_HTTP_URL=http://127.0.0.1:8079`; generate a private `REDIS_HTTP_TOKEN`.
- Generate independent `AUTH_SECRET`, `INTERNAL_API_KEY`, `EMAIL_ENCRYPT_SECRET`,
  and `EMAIL_ENCRYPT_SALT` values. Preserve the encryption values with the database.
- Enter your own Google and/or Microsoft OAuth credentials. Placeholder values
  can permit compilation but cannot connect a mailbox.

Initialize `.context/postgres` using `initdb.exe` with SCRAM authentication and
its interactive password prompt. Start that instance with `pg_ctl.exe` on
`127.0.0.1:5433`, then create the database named in `DATABASE_URL`. A fresh clone
must initialize this data directory before using the portable runner.

Ports 3000 (app), 3010 (quota gateway), 5433 (PostgreSQL), 6380 (Garnet), and
8079 (Redis HTTP bridge) must be free. The runner binds services to loopback.
Do not point another app at port 3000; the desktop launcher checks app readiness
and reports a conflicting server instead of treating it as Inbox Zero.

## Configure OpenRouter

Put your own API key in `apps/web/.env.local`. This example selects OpenRouter's
free-model router; choose a currently available model that supports structured
output and tool calling if you prefer a fixed model.

```dotenv
OPENROUTER_API_KEY=replace-with-your-own-key
OPENROUTER_BASE_URL=http://127.0.0.1:3010/api/v1
OPENROUTER_REQUESTS_PER_MINUTE=20
OPENROUTER_REQUESTS_PER_DAY=50
OPENROUTER_FREE_ONLY=true
DEFAULT_LLMS=openrouter:openrouter/free
ECONOMY_LLMS=openrouter:openrouter/free
NANO_LLMS=openrouter:openrouter/free
CHAT_LLMS=openrouter:openrouter/free
DRAFT_LLMS=openrouter:openrouter/free
```

The gateway defaults to 20 forwarded attempts/minute and 50/day. OpenRouter
currently documents a 1,000/day allowance for free models after qualifying
credit purchases; verify your own allowance before setting
`OPENROUTER_REQUESTS_PER_DAY=1000`. See [OpenRouter pricing and limits](https://openrouter.ai/pricing).
These variables limit this installation; they do not upgrade a provider account.
Paid models are blocked while free-only mode is enabled.

At a 1,000/day setting, backlog work can use at most 900 requests and 100 are
protected for new mail and interactive use. At 50/day, all 50 are protected, so
bulk backfill waits. Minute/day usage survives restarts in SQLite. A completed
batch of 20 attempts is followed by a full 60-second cooldown. Failed attempts
and retries count. The day resets at the absolute boundary 00:00 UTC.

Only requests routed through this gateway are covered by its local counter.
Account-level AI-provider overrides and other applications using the same key
must be accounted for separately; OpenRouter remains authoritative. Upstream
usage is imported when its API reports a usable free-request count.

## Connect Gmail and optional Calendar

1. Create your own Google Cloud project and enable Gmail API.
2. For personal Gmail, configure an External OAuth consent application and add
   the mailbox owner as a test user while the consent app is in testing.
3. Follow [the upstream Google OAuth guide](docs/hosting/google-oauth.mdx) for scopes.
4. Create a Web application client with origin `http://localhost:3000` and
   register these exact callbacks:
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:3000/api/google/linking/callback`
5. Download its JSON and run **Configure Gmail.cmd** with the private file path.

For optional Calendar linking, enable the Calendar API and required consent
scopes, and set:

```dotenv
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/google/linking/callback
```

Signed Calendar state is dispatched to the Calendar handler; browser-cookie and
account-ownership checks remain in place. Start a fresh Connect Calendar flow
after changing callbacks. Drive and other optional integrations need their own
provider setup. See [OUTLOOK-SETUP.md](OUTLOOK-SETUP.md) for Microsoft accounts.

## Build and run

From the checkout, run **Build Inbox Zero.cmd**, then **Start Inbox Zero.cmd**.
The build deploys database migrations before building the production app.
Open `http://localhost:3000/mail?accountScope=all&split=all` and connect mailboxes.
Use **Stop Inbox Zero.cmd** to stop this installation's services.

Starting the local runner with an OpenRouter key starts automation for connected
mailboxes. Its setup enables standard tagging and reply-draft rules. Bulk
processing applies labels only; recent-mail processing permits labels and saved
drafts. It filters out automatic send and archive actions in this local AI path.
Review mailbox rules before starting it if you need different behavior.

For a desktop app icon, run the installer from PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-openrouter/install-windows.ps1
```

It compiles the launcher, derives an icon from the repository's Inbox Zero image,
and creates Desktop/Start-menu shortcuts. Existing private launcher configuration
is preserved. Pin the Start-menu shortcut to the taskbar using Windows.
Add `-EnableStartup` if you want background services started at Windows sign-in.
Use `-ValidateOnly` to compile a separate validation binary/icon without changing
configuration or shortcuts. Generated files live under ignored `.context/desktop/`.

The launcher reuses healthy services or starts them, waits for the mail server
and both workers, and opens the combined inbox. Closing the browser/app window
leaves services running. The independent scheduled-mail worker checks Send later,
reminders, and snoozes every 15 seconds, even when the AI allowance is exhausted.
The runner generates a private `CRON_SECRET` on first start if one is absent.

## Background behavior and data

- Each mailbox is checked for arrivals every five seconds without a public
  webhook tunnel. This is polling, not provider push delivery.
- Up to four backlog jobs leave two execution slots available for recent mail.
- Each bulk AI call classifies up to ten emails independently. At 900 full
  batches, the theoretical maximum is 9,000 older emails/day; retries, partial
  batches, and other usage reduce that figure.
- New mail uses the native rule/draft pipeline and can require multiple AI calls.
  A reserve of 100 calls does not guarantee processing 100 messages.
- Decisions are saved before labels are written. Provider write failures can
  retry those decisions without another classification call.
- A persisted arrival cutoff distinguishes backlog from new mail, including mail
  that arrived while the machine was off. Discovery continues after the bulk
  allowance is exhausted. Processing resumes at the next UTC reset/startup.
- PostgreSQL draft-creation receipts recover confirmed provider IDs after a lost
  client response. Genuinely ambiguous writes are reconciled conservatively;
  sending remains deduplicated by the durable outbox.
- Initial mailbox catch-up is quota-aware and can take time for large mailboxes.
  Model latency and provider limits also affect classification speed.

AI processing sends selected email content to OpenRouter and its model provider.
Keep keys and OAuth credential files out of Git and review provider data policies
for your use case. `.env.local` and `.context/` are ignored.

| Local path | Purpose |
| --- | --- |
| `.context/postgres/` | Persistent mailbox/application database |
| `.context/openrouter/` | Persistent AI quota counters |
| `.context/local-ai/queue.sqlite` | Durable discovery/classification queue |
| `.context/local-ai/status.json` | AI progress and next reset |
| `.context/mail-jobs-status.json` | Scheduled-mail worker health |
| `.context/desktop/launcher.log` | Desktop readiness/startup log |
| `.context/logs/` | Private runtime logs |

`http://127.0.0.1:3010/health` exposes quota counts without credentials or email.
Back up the database and encryption configuration together. The Redis-compatible
cache is disposable. Changes to `NEXT_PUBLIC_*` settings require a rebuild.

## Verification

Gateway, queue, and scheduler-worker tests use synthetic data and no mailbox:

```powershell
..\tools\node-v24.22.1-win-x64\node.exe --test scripts/local-openrouter/gateway.test.mjs scripts/local-openrouter/queue.test.mjs scripts/local-openrouter/mail-jobs.test.mjs
```

The optional `scripts/local-openrouter/smoke.mjs` test uses one real AI call.
`apps/web/scripts/local-openrouter-smoke.ts` checks structured output and tools
with synthetic content and uses two real calls. Neither accesses a mailbox.
Focused app tests cover bulk assignments, draft receipts, callback state,
recipient parsing, split selection, keyboard navigation, and provider behavior.
Browser tests include a lost-creation-response recovery case and attachment placement.