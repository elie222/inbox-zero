# Integration Tests

Integration tests live in `apps/web/__tests__/integration/`. They test real code paths against fake services using `@inbox-zero/emulate`. No real credentials, no network, runs in seconds.

### Test tiers in this project

| Tier | Location | Flag | Backend |
|------|----------|------|---------|
| Unit | Colocated `*.test.ts` | none (default) | Everything mocked |
| Integration | `__tests__/integration/` | `RUN_INTEGRATION_TESTS` | Emulator (fake APIs) |
| E2E | `__tests__/e2e/` | `RUN_E2E_TESTS` | Real Gmail/Outlook |
| Flows | `__tests__/e2e/flows/` | `RUN_E2E_FLOW_TESTS` | Real accounts + webhooks |

**Integration vs E2E**: Same code under test. Integration uses the emulator (fast, CI-friendly). E2E uses real Google/Outlook (slow, needs credentials). Use integration for most new tests. Use E2E only for things the emulator can't simulate (real email delivery, OAuth browser flows).

### Running

```bash
cd apps/web
pnpm test-integration                                    # all integration tests
RUN_INTEGRATION_TESTS=true npx vitest --run __tests__/integration/<file>  # one file
```

### Setup pattern

```typescript
import { createEmulator, type Emulator } from "emulate";
import { gmail, auth } from "@googleapis/gmail";
import { GmailProvider } from "@/utils/email/google";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

// Mock Prisma if the code writes to DB
const mockCreateMany = vi.fn().mockResolvedValue({ count: 0 });
vi.mock("@/utils/prisma", () => ({
  default: {
    emailMessage: { createMany: (...args: unknown[]) => mockCreateMany(...args) },
  },
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;

describe.skipIf(!RUN_INTEGRATION_TESTS)("My test", { timeout: 30_000 }, () => {
  let emulator: Emulator;
  let provider: GmailProvider;

  beforeAll(async () => {
    emulator = await createEmulator({
      service: "google",
      port: 4099,
      seed: {
        google: {
          users: [{ email: "test@example.com", name: "Test" }],
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
              subject: "Test",
              body_text: "Hello",
              label_ids: ["INBOX", "UNREAD"],
            },
          ],
        },
      },
    });

    const oauth2Client = new auth.OAuth2(
      "test-client.apps.googleusercontent.com",
      "test-secret",
    );
    oauth2Client.setCredentials({ access_token: "emulator-token" });

    const gmailClient = gmail({
      version: "v1",
      auth: oauth2Client,
      rootUrl: emulator.url,
    });

    provider = new GmailProvider(
      gmailClient,
      createScopedLogger("test"),
      "test-account-id",
    );
  });

  afterAll(() => emulator?.close());

  test("my test", async () => {
    // Use provider like normal — it hits the emulator
  });
});
```

### Slack emulator setup pattern

The emulator also supports Slack (`service: "slack"`). Use port 4098 (Google uses 4099).

```typescript
import { createEmulator, type Emulator } from "emulate";
import { WebClient } from "@slack/web-api";

vi.mock("server-only", () => ({}));

// Mock createSlackClient so production code uses the emulator-bound client
let emulatorClient: WebClient;
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: () => emulatorClient,
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;

describe.skipIf(!RUN_INTEGRATION_TESTS)("Slack test", { timeout: 30_000 }, () => {
  let emulator: Emulator;

  beforeAll(async () => {
    emulator = await createEmulator({
      service: "slack",
      port: 4098,
      seed: {
        slack: {
          team: { name: "TestWorkspace", domain: "test-workspace" },
          users: [
            { name: "alice", real_name: "Alice Smith", email: "alice@example.com" },
          ],
          channels: [
            { name: "notifications", is_private: true, topic: "Alerts" },
          ],
        },
      },
    });

    emulatorClient = new WebClient("emulator-token", {
      slackApiUrl: `${emulator.url}/api/`,
    });
  });

  afterAll(() => emulator?.close());

  test("my test", async () => {
    // Import and call Slack utility functions — they hit the emulator
    // via the mocked createSlackClient
  });
});
```

**Slack seed config fields**: `team` (`name`, `domain`), `users` (array of `name`, `real_name?`, `email?`, `is_admin?`), `channels` (array of `name`, `is_private?`, `topic?`, `purpose?`), `bots`, `oauth_apps`, `incoming_webhooks`, `signing_secret`.

**Default seed**: The emulator always creates team "Emulate", user "admin" (U000000001), and channels "general" (C000000001) + "random" (C000000002).

**Supported endpoints**: `auth.test`, `team.info`, `chat.postMessage/update/delete`, `conversations.list/info/create/history/members/join/leave/replies`, `users.info/list/lookupByEmail`, `reactions.add/get/remove`, `oauth.v2.access`.

**Limitation**: DM via `chat.postMessage({ channel: userId })` is not supported by the emulator — it only resolves channel IDs/names, not user IDs. Test DM flows by mocking at a higher level or by creating a named channel as a stand-in.

### Recall emulator setup pattern

Recall.ai is not part of `@inbox-zero/emulate`, so its emulator lives in-repo at `__tests__/emulators/recall.ts`. Same idea: stateful, real HTTP, no network. Point the client at it with `RECALL_BASE_URL` (the same override pattern as `GOOGLE_BASE_URL`).

```typescript
import { createRecallEmulator, type RecallEmulator } from "@/__tests__/emulators/recall";

const envMock = vi.hoisted(() => ({ RECALL_API_KEY: "", RECALL_BASE_URL: "" }));
vi.mock("@/env", () => ({ env: envMock }));

let emulator: RecallEmulator;
let provider: import("@/utils/recall/client").RecallBotProvider;

beforeAll(async () => {
  emulator = await createRecallEmulator();
  envMock.RECALL_BASE_URL = emulator.apiBase;
  envMock.RECALL_API_KEY = emulator.apiKey;

  // Import the client AFTER the env mock is populated.
  const { RecallBotProvider } = await import("@/utils/recall/client");
  provider = new RecallBotProvider(createTestLogger());
});
```

**Driving a call**: `emulator.advance(botId, code)` pushes a bot to the next lifecycle code; `emulator.attachTranscript(botId, turns)` stores transcript JSON and returns the transcript id. `emulator.requests` is a log for asserting on what the client actually sent.

**Webhooks**: `emulator.signWebhook(payload)` returns a Svix-signed `Request` to hand straight to the webhook route's `POST` (mirrors `createSignedSlackRequest`). Use `recallWebhookPayloads.statusChange(botId, code, subCode?)` and `recallWebhookPayloads.transcriptDone(botId, transcriptId)` to build bodies. Pass `{ secret }` to sign with the wrong key and assert the route rejects it.

**Ports**: the Recall emulator binds an ephemeral port by default (`createRecallEmulator()`), so parallel test files cannot collide. Pass `{ port }` only when something external needs a fixed address.

**Manual use**: `pnpm emulate:recall` runs it standalone and prints the env vars to paste into `.env.local`. Type `advance <botId> <code>` or `transcript <botId>` to emit a webhook body you can POST at `/api/recall/webhook`.

**Fidelity caveat**: unlike the Google/Slack emulators, this one encodes *our reading* of Recall's API. It catches regressions in our client, not a misreading of theirs. Correct it from real responses whenever we learn something new.

### Key points

- **`describe.skipIf(!RUN_INTEGRATION_TESTS)`** — tests are skipped by default, safe in CI
- **Seed data** via `createEmulator({ seed })` — messages, labels, calendars, drive items (Google); team, users, channels (Slack)
- **Google**: `rootUrl: emulator.url` routes the googleapis client to the emulator
- **Slack**: `slackApiUrl: emulator.url + "/api/"` routes the `@slack/web-api` WebClient to the emulator; mock `createSlackClient` to return this client
- **`emulator.reset()`** wipes state and replays seed data (use in `beforeEach` if needed)
- **Mock Prisma** when the code under test writes to the database — assert on the mock calls
- **Use `vi.spyOn(globalThis, "fetch")`** to verify API call patterns (e.g., no batch calls)
- Pick a unique port per test file to avoid conflicts when running in parallel (Google: 4099, Slack: 4098)
- See the `emulate` package README for full seed config schema
