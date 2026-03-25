/**
 * Integration test: stats loading reuses messages from pagination
 *
 * Verifies that saveBatch correctly processes messages returned by
 * getMessagesWithPagination without re-fetching via getMessagesBatch.
 *
 * Uses @inbox-zero/emulate for a local Gmail API and mocks Prisma for DB writes.
 *
 * Usage:
 *   pnpm test-integration stats-reuse-messages
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createEmulator, type Emulator } from "emulate";
import { gmail, auth } from "@googleapis/gmail";
import { GmailProvider } from "@/utils/email/google";
import { saveBatch } from "@/utils/actions/stats";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

// Mock Prisma — saveBatch writes to emailMessage table
const mockCreateMany = vi.fn().mockResolvedValue({ count: 0 });
vi.mock("@/utils/prisma", () => ({
  default: {
    emailMessage: {
      createMany: (...args: unknown[]) => mockCreateMany(...args),
    },
  },
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "stats-test@example.com";
const TEST_PORT = 4099;

const SEED_MESSAGES = [
  {
    id: "msg_1",
    user_email: TEST_EMAIL,
    from: "Alice Smith <alice@example.com>",
    to: TEST_EMAIL,
    subject: "First email",
    body_text: "Hello from Alice",
    body_html:
      '<p>Hello from Alice <a href="https://unsub.example.com/1">unsubscribe</a></p>',
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900000000",
  },
  {
    id: "msg_2",
    user_email: TEST_EMAIL,
    from: "bob@corp.com",
    to: TEST_EMAIL,
    subject: "Second email",
    body_text: "Hello from Bob",
    label_ids: ["INBOX"],
    internal_date: "1711900060000",
  },
  {
    id: "msg_3",
    user_email: TEST_EMAIL,
    from: "carol@shop.io",
    to: TEST_EMAIL,
    subject: "Third email",
    body_text: "Hello from Carol",
    label_ids: ["INBOX", "UNREAD", "SENT"],
    internal_date: "1711900120000",
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Stats: reuse messages from pagination",
  { timeout: 30_000 },
  () => {
    let emulator: Emulator;
    let provider: GmailProvider;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "google",
        port: TEST_PORT,
        seed: {
          google: {
            users: [{ email: TEST_EMAIL, name: "Stats Test" }],
            oauth_clients: [
              {
                client_id: "test-client.apps.googleusercontent.com",
                client_secret: "test-secret",
                redirect_uris: ["http://localhost:3000/callback"],
              },
            ],
            messages: SEED_MESSAGES,
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

      const logger = createScopedLogger("test");
      provider = new GmailProvider(gmailClient, logger, "test-account-id");

      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterAll(async () => {
      fetchSpy?.mockRestore();
      await emulator?.close();
    });

    test("saveBatch processes emulator messages and saves to DB", async () => {
      mockCreateMany.mockClear();

      const logger = createScopedLogger("test");

      const result = await saveBatch({
        emailAccountId: "test-account-id",
        emailProvider: provider,
        logger,
        nextPageToken: undefined,
        before: undefined,
        after: undefined,
      });

      // Should return the messages
      expect(result.data.messages).toHaveLength(3);

      // Should have called prisma.emailMessage.createMany
      expect(mockCreateMany).toHaveBeenCalledTimes(1);

      const savedData = mockCreateMany.mock.calls[0][0];
      expect(savedData.skipDuplicates).toBe(true);

      const emails = savedData.data;
      expect(emails).toHaveLength(3);

      // Verify field extraction works correctly from emulator messages
      for (const email of emails) {
        expect(email.emailAccountId).toBe("test-account-id");
        expect(email.messageId).toBeDefined();
        expect(email.threadId).toBeDefined();
        expect(email.from).toBeDefined();
        expect(email.date).toBeInstanceOf(Date);
      }

      // Check specific values from seed data
      const aliceEmail = emails.find(
        (e: { from: string }) => e.from === "alice@example.com",
      );
      expect(aliceEmail).toBeDefined();
      expect(aliceEmail.read).toBe(false); // has UNREAD label
      expect(aliceEmail.inbox).toBe(true); // has INBOX label
      expect(aliceEmail.sent).toBe(false);

      const carolEmail = emails.find(
        (e: { from: string }) => e.from === "carol@shop.io",
      );
      expect(carolEmail).toBeDefined();
      expect(carolEmail.sent).toBe(true); // has SENT label
      expect(carolEmail.read).toBe(false); // has UNREAD label

      const bobEmail = emails.find(
        (e: { from: string }) => e.from === "bob@corp.com",
      );
      expect(bobEmail).toBeDefined();
      expect(bobEmail.read).toBe(true); // no UNREAD label
    });

    test("no batch API call is made", async () => {
      fetchSpy.mockClear();

      const logger = createScopedLogger("test");

      await saveBatch({
        emailAccountId: "test-account-id",
        emailProvider: provider,
        logger,
        nextPageToken: undefined,
        before: undefined,
        after: undefined,
      });

      // Batch endpoint would be a fetch to /batch/gmail/v1
      const batchCalls = fetchSpy.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" && call[0].includes("/batch/gmail/"),
      );
      expect(batchCalls).toHaveLength(0);
    });
  },
);
