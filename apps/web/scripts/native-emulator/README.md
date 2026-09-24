# Native emulator runner

Run this repository as a fully local backend for a native client. Nothing here
talks to production. The same Next.js app serves `mail/v1` and Better Auth.
Google and Microsoft come from `@inbox-zero/emulate`. Postgres and Redis are
disposable containers with tmpfs data disks.

Playwright's `webServer` is a different lifecycle: it starts one provider, runs
a spec, and exits. This runner stays up until you stop it.

## Mac worker

From a clone of this repo, with Docker running and no production env vars
exported:

```sh
pnpm install
pnpm -F inbox-zero-ai native-emulator:up
```

The command prints:

```text
BASE_URL=http://127.0.0.1:<port>
CONTROL_URL=http://127.0.0.1:<port>
GOOGLE_BASE_URL=http://127.0.0.1:<port>
MICROSOFT_BASE_URL=http://127.0.0.1:<port>
```

Point the native client at `BASE_URL`. The simulator on that Mac can use the
loopback address directly. Do not substitute a deployed host.

Stop it, including the database volume:

```sh
pnpm -F inbox-zero-ai native-emulator:down
```

`up` refuses to start when `DATABASE_URL`, `GOOGLE_BASE_URL`,
`MICROSOFT_BASE_URL`, or `NEXT_PUBLIC_BASE_URL` already point off loopback.
The Next process receives only the runner's local URLs and the emulator client
ids (`emulate-google-client.apps.googleusercontent.com` /
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

OAuth client secrets are the emulator fixtures in that seed file. A new `up`
after `down` migrates a fresh database and reloads that seed. There is no
shared volume to clean by hand.

## Response loss

`@inbox-zero/emulate` does not drop a response after it applies a write. The
runner puts a proxy on `GOOGLE_BASE_URL` and `MICROSOFT_BASE_URL`. Reads pass
through. The next successful `POST`, `PUT`, `PATCH`, or `DELETE` can be hidden
from the client after the emulator has accepted it:

```sh
curl -X POST "$CONTROL_URL/response-loss" \
  -H 'content-type: application/json' \
  -d '{"provider":"google","count":1}'
```

`provider` is `google`, `microsoft`, or `both`. `GET $CONTROL_URL/response-loss`
shows the remaining count. `DELETE $CONTROL_URL/response-loss` disarms it.
A non-2xx upstream response does not consume a count, because the write did
not apply. The client observes a dropped successful write as a connection
reset and must reconcile provider state instead of sending a second copy.

## Smoke

```sh
pnpm -F inbox-zero-ai test:native-emulator
pnpm -F inbox-zero-ai native-emulator:smoke
```

The first command checks the proxy and the loopback guard. The second starts
the stack, requires `/api/auth/ok` plus both provider discovery documents and
the control server, then tears it down. Logs from a failed run stay under
`apps/web/.tmp/native-emulator/`.
