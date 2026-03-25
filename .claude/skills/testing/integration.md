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

### Key points

- **`describe.skipIf(!RUN_INTEGRATION_TESTS)`** — tests are skipped by default, safe in CI
- **Seed data** via `createEmulator({ seed })` — messages, labels, calendars, drive items
- **`rootUrl: emulator.url`** routes the googleapis client to the emulator
- **`emulator.reset()`** wipes state and replays seed data (use in `beforeEach` if needed)
- **Mock Prisma** when the code under test writes to the database — assert on the mock calls
- **Use `vi.spyOn(globalThis, "fetch")`** to verify API call patterns (e.g., no batch calls)
- Pick a unique port per test file to avoid conflicts when running in parallel
- See the `emulate` package README for full seed config schema
