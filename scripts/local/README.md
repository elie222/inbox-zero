# Local launcher

One command starts the whole Inbox Zero stack on a production build. It replaces `pnpm dev` (about 3 GB and slow) and stops the old Docker `web`/`cron` containers from retaking port 3000.

## Commands

| Command | What it does |
| --- | --- |
| `inbox start` | Starts everything (see below) |
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
5. Builds if the code changed, then runs `next start` on port 3000.
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
| `INBOX_NODE_BIN` | Node binary to use |
| `INBOX_COMPOSE_PROJECT` | Docker compose project name |
| `INBOX_REPO` | Path to the repo |

## AI model slots

`DEFAULT_LLMS` and `ECONOMY_LLMS` in `apps/web/.env` point at `gemma4:12b-it-qat` on Ollama (2026-10-19 eval pick, see `evals/REPORT.md`). The chat slot is left unset.

## New mail

New mail needs the Tailscale Funnel limited to `/api/outlook/webhook`, with `WEBHOOK_URL` set to its https address. The script only checks this. It does not set it up.
