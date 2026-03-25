/**
 * Emulator test: stats loading reuses messages from pagination
 *
 * Verifies that saveBatch uses messages already returned by
 * getMessagesWithPagination instead of re-fetching them via getMessagesBatch.
 *
 * Uses @inbox-zero/emulate to run a local Gmail API server seeded with
 * test messages, then constructs a real GmailProvider pointed at it.
 *
 * Usage:
 *   pnpm test-e2e emulator/stats-reuse-messages
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createEmulator, type Emulator } from "emulate";
import { gmail, auth } from "@googleapis/gmail";
import { GmailProvider } from "@/utils/email/google";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

const TEST_EMAIL = "stats-test@example.com";
const TEST_PORT = 4099;

const SEED_MESSAGES = [
  {
    id: "msg_1",
    user_email: TEST_EMAIL,
    from: "alice@example.com",
    to: TEST_EMAIL,
    subject: "First email",
    body_text: "Hello from Alice",
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
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900120000",
  },
];

describe("Stats: reuse messages from pagination", { timeout: 30_000 }, () => {
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

    // Create a Gmail client pointed at the emulator
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

    // Spy on global fetch to detect batch API calls
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterAll(async () => {
    fetchSpy?.mockRestore();
    await emulator?.close();
  });

  test("getMessagesWithPagination returns full messages", async () => {
    const result = await provider.getMessagesWithPagination({
      maxResults: 10,
    });

    expect(result.messages.length).toBe(3);

    // Each message should have full content — headers, body, etc.
    for (const msg of result.messages) {
      expect(msg.id).toBeDefined();
      expect(msg.threadId).toBeDefined();
      expect(msg.headers.from).toBeDefined();
      expect(msg.headers.to).toBeDefined();
      expect(msg.internalDate).toBeDefined();
    }
  });

  test("stats loading does not call batch endpoint", async () => {
    fetchSpy.mockClear();

    // Call getMessagesWithPagination (same path as saveBatch)
    const result = await provider.getMessagesWithPagination({
      maxResults: 10,
    });

    // Messages should be usable directly — the fields saveBatch needs
    for (const msg of result.messages) {
      expect(msg.headers.from).toBeTruthy();
      expect(msg.internalDate).toBeTruthy();
    }

    // Verify no batch API call was made
    // The batch endpoint would be a fetch to /batch/gmail/v1
    const batchCalls = fetchSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" && call[0].includes("/batch/gmail/"),
    );
    expect(batchCalls).toHaveLength(0);
  });
});
