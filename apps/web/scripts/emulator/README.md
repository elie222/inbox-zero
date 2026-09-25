# Local emulator

Runs the real web backend with the Google and Microsoft emulators and throwaway
Postgres and Redis. Use it for local development, agents, and any client.
Nothing here talks to production.

Playwright's `webServer` starts one provider for a spec and exits. This stack
stays up until you stop it.

## Run

Docker must be running. From a clone of this repo:

```sh
pnpm install
pnpm -F inbox-zero-ai emulator:up
```

The command prints:

```text
BASE_URL=http://127.0.0.1:<port>
GOOGLE_BASE_URL=http://127.0.0.1:<port>
MICROSOFT_BASE_URL=http://127.0.0.1:<port>
```

Point a client at `BASE_URL`.

Stop it, including the database volume:

```sh
pnpm -F inbox-zero-ai emulator:down
```

`up` refuses to start when `DATABASE_URL`, `GOOGLE_BASE_URL`,
`MICROSOFT_BASE_URL`, or `NEXT_PUBLIC_BASE_URL` already point off loopback.
The Next process receives only local URLs and the emulator client ids
(`emulate-google-client.apps.googleusercontent.com` /
`emulate-microsoft-client-id`). Those are not production credentials.

`up --foreground` stays attached and tears the stack down on Ctrl-C.

## Seed

`up` writes the existing dual-provider seed, plus one extra empty mailbox on
each provider so two users can sign in:

| Provider | Mailbox | Contents |
| --- | --- | --- |
| Google | `developer@example.com` | Demo inbox from `scripts/emulate-seed.ts` |
| Google | `teammate@example.com` | Empty mailbox |
| Microsoft | `developer@outlook.test` | Empty mailbox |
| Microsoft | `teammate@outlook.test` | Empty mailbox |

A new `up` after `down` migrates a fresh database and reloads that seed.

Logs from a failed run stay under `apps/web/.tmp/emulator/`.
