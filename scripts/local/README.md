# Local launcher

One command starts the whole Inbox Zero stack on a production build. It replaces `pnpm dev` (about 3 GB and slow) and stops the old Docker `web`/`cron` containers from retaking port 3000.

## Commands

| Command | What it does |
| --- | --- |
| `inbox start` | Starts everything (see below) |
| `inbox start --takeover` | Starts everything and moves mailbox ownership here from another copy |
| `inbox stop` | Stops the app and the cron loop, then the services |
| `inbox stop --keep-services` | Stops the app and cron loop, leaves Postgres, Redis and Ollama running |
| `inbox status` | Shows what is running |
| `inbox build` | Rebuilds the production build |
| `inbox logs` | Shows the logs |

## What `start` does, in order

1. Starts OrbStack (Docker).
2. Starts the Postgres, Redis and Redis-HTTP containers.
3. Keeps the old `web`, `cron` and `worker` containers stopped.
4. Starts Ollama.
5. Builds if the code changed (a changed `NEXT_PUBLIC_*` value counts), then runs `next start` on port 3000, bound to this Mac only (127.0.0.1).
6. Starts a local cron loop with the 7 jobs the old cron container ran:

| Job | Every |
| --- | --- |
| scheduled-actions | 15 min |
| automation-jobs | 15 min |
| follow-up-reminders | 1 h |
| digest | 30 min |
| meeting-briefs | 15 min |
| meeting-recorder schedule | 5 min |
| watch renewal | 6 h |

Then it turns on Tailscale Serve for private phone access (see below), checks the webhook Funnel, and opens the private URL (or `http://127.0.0.1:3000` if Serve is not available).

## Only one copy acts on the mailbox

Two copies (say the Mac and the PC) on one Outlook mailbox would both run your rules on every new email. Each copy points its Outlook webhook at its own address, and Microsoft lists every webhook the app holds for the mailbox. That list decides the owner:

- A copy whose address doesn't hold the live webhook stands by. It doesn't renew its webhook, and the cron jobs answer `{"skipped":"standby"}` instead of acting on mail.
- If both copies hold a webhook, the one whose host name sorts first keeps it, and the other drops its own. Both sides reach the same answer without talking to each other.
- `inbox start --takeover` removes the other copies' webhooks and claims the mailbox here. The other copy notices within about 10 minutes and stands by.
- `inbox start` also warns when another copy answers on the tailnet at `:8443`.
- `inbox status` shows `mailbox: owned by this copy` or `mailbox: STANDBY, owned by <host>`.

The webhook URL is what tells copies apart, so each copy needs its own `WEBHOOK_URL`.

## Private phone access

The app listens on this Mac only, so nobody else on the Wi-Fi can reach it. `inbox start` also runs Tailscale Serve, which publishes the app at `https://<mac-name>.<tailnet>.ts.net:8443` to your own Tailscale devices only (the Tailscale app must be on, on the Mac and the phone). `inbox start` prints the exact address.

- The Funnel on port 443 stays as it is: public, and only for `/api/outlook/webhook`. `inbox start` and `inbox status` warn if the Funnel ever exposes more than that, or if port 8443 turns public. If it does, run `tailscale serve --https=8443 off`.
- To sign in at the private address, set `NEXT_PUBLIC_BASE_URL` in `apps/web/.env` to the `:8443` URL (the next `inbox start` rebuilds on its own), and add these redirect URIs to the Azure app registration: `<url>/api/auth/callback/microsoft` and `<url>/api/outlook/linking/callback`. The localhost URIs can stay as a fallback.
- It works only while the Mac is awake and the app is running.
- `INBOX_SERVE_PORT` changes the port (default 8443).

## One-time setup

```sh
ln -s "$PWD/scripts/local/inbox" ~/.local/bin/inbox
```

Run it from the repo root. Make sure `~/.local/bin` is on your `PATH`.

## State and logs

`~/Library/Application Support/inbox-zero-local`

## Env overrides

| Variable | Meaning |
| --- | --- |
| `INBOX_PORT` | Port for the app (default 3000) |
| `INBOX_SERVE_PORT` | Private tailnet HTTPS port (default 8443) |
| `INBOX_NODE_BIN` | Node binary to use |
| `INBOX_COMPOSE_PROJECT` | Docker compose project name |
| `INBOX_REPO` | Path to the repo |

## AI model slots

`DEFAULT_LLMS` and `ECONOMY_LLMS` in `apps/web/.env` point at `gemma4:12b-it-qat` on Ollama (2026-10-19 eval pick, see `evals/REPORT.md`). The chat slot is left unset.

## New mail

New mail needs the Tailscale Funnel limited to `/api/outlook/webhook`, with `WEBHOOK_URL` set to its https address. The script only checks this. It does not set it up.
