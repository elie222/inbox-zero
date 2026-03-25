---
name: emulator-test
description: Write e2e tests using the Google emulator (@inbox-zero/emulate)
---

## Google Emulator Tests

Tests in `apps/web/__tests__/e2e/emulator/` use `@inbox-zero/emulate` to run a local fake Gmail/Calendar/Drive API server. No real Google credentials needed.

### Setup pattern

```typescript
import { createEmulator, type Emulator } from "emulate";
import { gmail, auth } from "@googleapis/gmail";
import { GmailProvider } from "@/utils/email/google";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

let emulator: Emulator;
let provider: GmailProvider;

beforeAll(async () => {
  emulator = await createEmulator({
    service: "google",
    port: 4099, // pick a port that won't conflict
    seed: {
      google: {
        users: [{ email: "test@example.com", name: "Test User" }],
        oauth_clients: [{
          client_id: "test-client.apps.googleusercontent.com",
          client_secret: "test-secret",
          redirect_uris: ["http://localhost:3000/callback"],
        }],
        messages: [
          {
            id: "msg_1",
            user_email: "test@example.com",
            from: "sender@example.com",
            to: "test@example.com",
            subject: "Test email",
            body_text: "Hello",
            label_ids: ["INBOX", "UNREAD"],
          },
        ],
      },
    },
  });

  const oauth2Client = new auth.OAuth2("test-client.apps.googleusercontent.com", "test-secret");
  oauth2Client.setCredentials({ access_token: "emulator-token" });
  const gmailClient = gmail({ version: "v1", auth: oauth2Client, rootUrl: emulator.url });
  provider = new GmailProvider(gmailClient, createScopedLogger("test"), "test-account-id");
});

afterAll(() => emulator?.close());
```

### Key points

- **Seed data** via the `seed` option — messages, labels, calendars, drive items
- **`rootUrl: emulator.url`** routes googleapis client to the emulator
- **`emulator.reset()`** wipes state and replays seed between tests
- **No database needed** for pure API tests; if testing code that writes to DB (like stats), you need a real DB connection
- Emulator supports: messages list/get/send/modify, labels, threads, drafts, calendar events, drive files, OAuth flows
- See the `emulate` README for full seed config schema and supported endpoints

### Running

```bash
cd apps/web
RUN_E2E_TESTS=true npx vitest --run __tests__/e2e/emulator/<test-file>
```

### When to use

- Testing Gmail/Google API interactions without real credentials
- Verifying API call patterns (e.g., no redundant fetches)
- Testing code that processes email data (stats, rules, cold-email detection)
- CI-friendly — no network, no tokens, no flaky OAuth
