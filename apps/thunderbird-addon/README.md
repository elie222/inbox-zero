# Inbox Zero ↔ Thunderbird Bridge

Use accounts already signed into Thunderbird with a local Inbox Zero. The add-on watches mail, posts it to Inbox Zero, runs AI rules, then applies archive / tag / draft / etc. back in Thunderbird.

Intended for local / self-hosted use first.

## Architecture

```
Thunderbird (signed-in accounts)
  └─ Inbox Zero Bridge add-on
       ├─ POST /api/thunderbird/process   → AI rules
       ├─ GET  /api/thunderbird/actions   → pending actions
       └─ apply archive/tag/draft/… in Thunderbird
```

Inbox Zero treats these mailboxes as `Account.provider = "thunderbird"`. No Google/Microsoft OAuth is required for the bridge path.

## Prerequisites

- Docker Postgres + Redis (`docker compose -f docker-compose.dev.yml up -d`)
- Local Inbox Zero (`pnpm install`, env setup, `pnpm dev`)
- `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true` (already in `.env.example`) **or** run the setup script’s premium grant
- LLM configured (`DEFAULT_LLMS` + `LLM_API_KEY` as needed)
- `INTERNAL_API_KEY` set (or `THUNDERBIRD_BRIDGE_SECRET`)

## 1. Setup bridge user / mailbox

```bash
cd apps/web
pnpm exec dotenv -e .env.local -- tsx scripts/setup-thunderbird-bridge.ts
# optional: pre-create one mailbox + starter rules
pnpm exec dotenv -e .env.local -- tsx scripts/setup-thunderbird-bridge.ts you@example.com
```

## 2. Start Inbox Zero

```bash
# repo root
pnpm dev
```

## 3. Install the Thunderbird add-on

1. Open Thunderbird → Settings → Add-ons and Themes → gear → **Debug Add-ons**
2. **Load Temporary Add-on…**
3. Select `apps/thunderbird-addon/manifest.json`

Temporary add-ons unload when Thunderbird restarts; reload the same way after a restart.

## 4. Configure the add-on

Open the add-on options (toolbar button → Settings):

| Setting | Value |
|--------|--------|
| Base URL | `http://localhost:3000` |
| Bridge secret | same as `THUNDERBIRD_BRIDGE_SECRET` or `INTERNAL_API_KEY` |
| Auto-process | on |

Then click **Register Thunderbird accounts** (creates/links `EmailAccount` rows for each TB identity).

## 5. Use it

1. New mail is processed automatically (or toolbar → **Process unread**)
2. Open **http://localhost:3000/bridge** — enter mailbox email + bridge secret → **Load inbox**
3. Review proposed actions / edit drafts → **Approve → Thunderbird** (or Reject)
4. The add-on polls and applies approved actions in Thunderbird

Starter rules (if you passed an email to the setup script):

- Draft replies for mail that needs a personal response
- Archive + tag obvious newsletters

Edit rules in the Inbox Zero UI once you’re signed in as the bridge user, or via Prisma / future UI login for `thunderbird-bridge@localhost`.

## API (localhost)

All routes require header:

```http
x-thunderbird-bridge-secret: <secret>
```

(or `x-api-key` with the same value)

| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST` | `/api/thunderbird/accounts` | List / register TB mailboxes |
| `POST` | `/api/thunderbird/process` | Run AI rules on one message |
| `GET/POST` | `/api/thunderbird/actions` | List pending actions / ack applied |

## Limits (v1)

- Thunderbird must be running
- Message IDs used for actions are Thunderbird session IDs (fine for immediate apply; less ideal days later)
- Compose drafts open via TB compose APIs (saved as draft when supported)
- Not a replacement for Gmail/Graph features (watch, filters, Drive filing, etc.)
- Not packaged for addons.thunderbird.net yet

## Upstream later

Generic IMAP ([#925](https://github.com/elie222/inbox-zero/issues/925)) is the broader product path. This bridge is the “reuse my Thunderbird session” path for personal/local use.
