/**
 * Integration test: queued Gmail bulk archive handler archives sender mail in the background
 *
 * Verifies that the internal bulk archive route executes against the Gmail emulator,
 * removes the INBOX label for the targeted sender, and leaves unrelated mail untouched.
 *
 * Usage:
 *   pnpm test-integration mail-bulk-archive-queue
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createEmulator, type Emulator } from "emulate";
import { auth, gmail, type gmail_v1 } from "@googleapis/gmail";

vi.mock("server-only", () => ({}));

const mockUpdateEmailMessagesForSender = vi.fn().mockResolvedValue(undefined);
const mockPublishBulkActionToTinybird = vi.fn().mockResolvedValue(undefined);

let gmailClient: gmail_v1.Gmail;

vi.mock("@/utils/account", () => ({
  getGmailClientForEmail: vi.fn(async () => gmailClient),
  getOutlookClientForEmail: vi.fn(),
}));

vi.mock("@/utils/email/bulk-action-tracking", () => ({
  updateEmailMessagesForSender: (
    ...args: Parameters<typeof mockUpdateEmailMessagesForSender>
  ) => mockUpdateEmailMessagesForSender(...args),
  publishBulkActionToTinybird: (
    ...args: Parameters<typeof mockPublishBulkActionToTinybird>
  ) => mockPublishBulkActionToTinybird(...args),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "bulk-archive-test@example.com";
const TEST_PORT = 4101;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Mail bulk archive queue",
  { timeout: 30_000 },
  () => {
    let emulator: Emulator;

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "google",
        port: TEST_PORT,
        seed: {
          google: {
            users: [{ email: TEST_EMAIL, name: "Bulk Archive Test" }],
            oauth_clients: [
              {
                client_id: "test-client.apps.googleusercontent.com",
                client_secret: "test-secret",
                redirect_uris: ["http://localhost:3000/callback"],
              },
            ],
            messages: [
              {
                id: "msg_1",
                user_email: TEST_EMAIL,
                from: "target@example.com",
                to: TEST_EMAIL,
                subject: "Archive me",
                body_text: "First target message",
                label_ids: ["INBOX", "UNREAD"],
              },
              {
                id: "msg_2",
                user_email: TEST_EMAIL,
                from: "target@example.com",
                to: TEST_EMAIL,
                subject: "Archive me too",
                body_text: "Second target message",
                label_ids: ["INBOX"],
              },
              {
                id: "msg_3",
                user_email: TEST_EMAIL,
                from: "other@example.com",
                to: TEST_EMAIL,
                subject: "Leave me alone",
                body_text: "Other sender message",
                label_ids: ["INBOX"],
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

      gmailClient = gmail({
        version: "v1",
        auth: oauth2Client,
        rootUrl: emulator.url,
      });
    });

    afterAll(async () => {
      await emulator?.close();
    });

    beforeEach(async () => {
      await emulator.reset();
      mockUpdateEmailMessagesForSender.mockClear();
      mockPublishBulkActionToTinybird.mockClear();
      vi.resetModules();
    });

    it("archives only the targeted sender when the queued handler runs", async () => {
      const { POST } = await import("@/app/api/mail/bulk-archive/route");

      const response = await POST(
        new Request("http://localhost/api/mail/bulk-archive", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env.INTERNAL_API_KEY!,
          },
          body: JSON.stringify({
            emailAccountId: "account-1",
            ownerEmail: TEST_EMAIL,
            provider: "google",
            sender: "target@example.com",
          }),
        }) as any,
      );

      expect(response.status).toBe(200);

      const [targetMessageOne, targetMessageTwo, otherMessage] =
        await Promise.all([
          gmailClient.users.messages.get({
            userId: "me",
            id: "msg_1",
            format: "metadata",
          }),
          gmailClient.users.messages.get({
            userId: "me",
            id: "msg_2",
            format: "metadata",
          }),
          gmailClient.users.messages.get({
            userId: "me",
            id: "msg_3",
            format: "metadata",
          }),
        ]);

      expect(targetMessageOne.data.labelIds).not.toContain("INBOX");
      expect(targetMessageTwo.data.labelIds).not.toContain("INBOX");
      expect(otherMessage.data.labelIds).toContain("INBOX");

      expect(mockUpdateEmailMessagesForSender).toHaveBeenCalledTimes(1);
      expect(mockUpdateEmailMessagesForSender).toHaveBeenCalledWith({
        sender: "target@example.com",
        messageIds: ["msg_1", "msg_2"],
        emailAccountId: "account-1",
        action: "archive",
      });
      expect(mockPublishBulkActionToTinybird).toHaveBeenCalledTimes(1);
      expect(mockPublishBulkActionToTinybird).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "archive",
          ownerEmail: TEST_EMAIL,
        }),
      );
    });
  },
);
