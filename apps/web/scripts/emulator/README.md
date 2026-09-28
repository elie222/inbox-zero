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

## Scheduled send and drafts

Call these with the Better Auth session cookie and the `X-Email-Account-ID`
header. The same Next.js app still serves the server actions used by the web
composer.

The stack sets a local `CRON_SECRET` and polls
`GET /api/cron/scheduled-actions` with `Authorization: Bearer $CRON_SECRET`
every few seconds. A future `sendAt` is delivered by that timer. There is no
QStash process.

Schedule a send. `sendAt` and `remindAt` are ISO timestamps, or `null`. A null
`sendAt` sends immediately.

```sh
curl -X POST "$BASE_URL/api/user/scheduled-emails" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID" \
  -d '{
    "clientMutationId": "827f1b38-2032-4bfd-bc2c-cbba02746b04",
    "threadId": null,
    "messageIds": [],
    "email": {
      "to": "teammate@example.com",
      "subject": "Later",
      "messageHtml": "<p>Hello</p>"
    },
    "sendAt": "2026-10-06T09:00:00.000Z",
    "remindAt": null
  }'
```

Repeating that request with the same `clientMutationId` and payload returns
the original id. A different payload for that id is rejected.

```sh
curl -X DELETE "$BASE_URL/api/user/scheduled-emails/$SCHEDULED_EMAIL_ID" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID"

curl -X POST "$BASE_URL/api/user/scheduled-emails/$SCHEDULED_EMAIL_ID/retry" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID"

curl -X DELETE "$BASE_URL/api/user/scheduled-emails/$SCHEDULED_EMAIL_ID/reminder" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID"
```

Create, update, and discard a provider draft. The response is
`{draftId, messageId, threadId}`.

```sh
curl -X POST "$BASE_URL/api/user/drafts" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID" \
  -d '{
    "content": {
      "to": "teammate@example.com",
      "subject": "Draft",
      "messageHtml": "<p>Hello</p>"
    }
  }'

curl -X PUT "$BASE_URL/api/user/drafts/$DRAFT_ID" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID" \
  -d '{
    "content": {
      "to": "teammate@example.com",
      "subject": "Draft",
      "messageHtml": "<p>Updated</p>"
    }
  }'

curl -X DELETE "$BASE_URL/api/user/drafts/$DRAFT_ID" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID"
```

Send that saved draft by admitting a `mail/v1` send operation whose intent
includes `providerDraftId` set to `draftId`. The executor passes it through
the same durable send used by `sendEmailBody.providerDraftId`, which updates
the provider draft and sends it. `queuedAtMs` is the current time in
milliseconds. `notBeforeMs` is only the undo-send and offline hold, so it does
not schedule this send.

```sh
curl -X PUT "$BASE_URL/api/mail/v1/accounts/$EMAIL_ACCOUNT_ID/operations/$OPERATION_ID" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID" \
  -d '{
    "protocolVersion": 1,
    "requestId": "send-draft",
    "session": { "accountId": "'"$EMAIL_ACCOUNT_ID"'", "generation": "local" },
    "attemptId": "attempt-1",
    "operation": {
      "key": {
        "accountId": "'"$EMAIL_ACCOUNT_ID"'",
        "operationId": "'"$OPERATION_ID"'"
      },
      "session": { "accountId": "'"$EMAIL_ACCOUNT_ID"'", "generation": "local" },
      "authority": "client",
      "payloadHash": "local",
      "intent": {
        "kind": "send",
        "frozenDraftId": "local-draft",
        "frozenDraftRevision": 1,
        "to": ["teammate@example.com"],
        "cc": [],
        "bcc": [],
        "subject": "Draft",
        "html": "<p>Hello</p>",
        "quotedHtml": "",
        "attachmentIds": [],
        "providerDraftId": "'"$DRAFT_ID"'",
        "replyToMessageId": null,
        "replyToConversationId": null,
        "queuedAtMs": 1790358000000
      }
    }
  }'
```

`POST /api/messages/send` accepts the same id on `sendEmailBody.providerDraftId`
when the client is not using `mail/v1`.

## Native iOS routes

These use the same session cookie. Routes marked with the email-account header
also require `X-Email-Account-ID`.

The stack enables local Apple signed-transaction checks
(`APPLE_IAP_LOCAL_TESTING=true`) and a fake APNs transport
(`APNS_TRANSPORT=fake`). It does not set App Store Server API or APNs `.p8`
secrets.

Delete the signed-in user. Response `{ "deleted": true }`. Sessions for that
user are removed. An ownership conflict returns `400`
`{ "error": "...", "isKnownError": true }`.

```sh
curl -X DELETE "$BASE_URL/api/user/account" \
  -H "cookie: $SESSION_COOKIE"
```

Remove one connected mailbox. Refusing the only mailbox returns `400` with
`isKnownError: true`. Response `{ "deleted": true }`.

```sh
curl -X DELETE "$BASE_URL/api/user/email-accounts/$EMAIL_ACCOUNT_ID" \
  -H "cookie: $SESSION_COOKIE"
```

Sync a StoreKit 2 JWS. Response `{ "premium": { ... } }`. In this stack the JWS
must be signed with the local testing key. A `transactionId` without
`signedTransaction` still calls Apple and returns `503` here.

```sh
curl -X POST "$BASE_URL/api/apple/subscription/sync" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -d '{ "signedTransaction": "<jws>" }'
```

Register an APNs device token, then send through the fake transport. The test
route returns `{ "sends": [...] }` and is `404` unless `APNS_TRANSPORT=fake`.

```sh
curl -X POST "$BASE_URL/api/mobile/push-token" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -d '{
    "token": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "platform": "ios",
    "tokenType": "apns"
  }'

curl -X POST "$BASE_URL/api/mobile/push/test" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -d '{ "title": "Hello", "body": "From the emulator" }'
```

List, snooze, and unsnooze. `snoozedUntil` must be at least one minute ahead.
List response `{ "threads": [{ "id", "threadId", "scheduledFor", "status" }] }`.

```sh
curl "$BASE_URL/api/user/snoozed-threads" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID"

curl -X POST "$BASE_URL/api/user/snoozed-threads" \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID" \
  -d '{ "threadIds": ["THREAD_ID"], "snoozedUntil": "2026-10-06T09:00:00.000Z" }'
```

List inbox categories and user splits.

```sh
curl "$BASE_URL/api/user/mail-splits" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID"
```

`GET /api/threads?inboxSection=newsletters` and `?category=promotions` are
accepted. A search scoped to spam or trash includes those folders:

```sh
curl "$BASE_URL/api/threads?type=spam&q=invoice" \
  -H "cookie: $SESSION_COOKIE" \
  -H "X-Email-Account-ID: $EMAIL_ACCOUNT_ID"
```

Logs from a failed run stay under `apps/web/.tmp/emulator/`.
