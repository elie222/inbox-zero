import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { searchInboxTool } from "@/utils/ai/assistant/chat-inbox-tools";
import { createEmailProvider } from "@/utils/email/provider";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const EMAIL = "assistant-paging@example.com";
const MATCHING_COUNT = 23;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Outlook assistant search paging",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: EMAIL,
        folders: [{ id: "receipts-folder", display_name: "Receipts" }],
        messages: [
          ...Array.from({ length: MATCHING_COUNT }, (_, index) =>
            seedMessage({
              id: `match-${index}`,
              from: "billing@example.com",
              folder: "receipts-folder",
              isRead: false,
              minute: index,
            }),
          ),
          seedMessage({
            id: "read-receipt",
            from: "billing@example.com",
            folder: "receipts-folder",
            isRead: true,
            minute: 30,
          }),
          seedMessage({
            id: "other-sender",
            from: "other@example.com",
            folder: "receipts-folder",
            isRead: false,
            minute: 31,
          }),
          seedMessage({
            id: "inbox-billing",
            from: "billing@example.com",
            folder: "inbox",
            isRead: false,
            minute: 32,
          }),
        ],
      });
      vi.mocked(createEmailProvider).mockResolvedValue(harness.provider);
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("pages through every match when follow-up calls pass only the page token", async () => {
      const search = searchInboxTool({
        email: EMAIL,
        emailAccountId: "email-account-1",
        provider: "microsoft",
        logger: createTestLogger(),
      });
      const schema = search.inputSchema as any;
      const threadIds: string[] = [];
      let input: unknown = {
        fromEmail: "billing@example.com",
        readState: "unread",
        folderName: "Receipts",
        limit: 10,
      };
      let pages = 0;

      while (input) {
        const result: any = await (search.execute as any)(schema.parse(input));
        expect(result.error).toBeUndefined();
        threadIds.push(...result.messages.map((m: any) => m.threadId));
        pages += 1;
        expect(pages).toBeLessThanOrEqual(5);
        input = result.nextPageToken
          ? { pageToken: result.nextPageToken, limit: 10 }
          : undefined;
      }

      expect(pages).toBeGreaterThan(1);
      expect(threadIds.sort()).toEqual(
        Array.from(
          { length: MATCHING_COUNT },
          (_, index) => `match-${index}-thread`,
        ).sort(),
      );
    });
  },
);

function seedMessage({
  id,
  from,
  folder,
  isRead,
  minute,
}: {
  id: string;
  from: string;
  folder: string;
  isRead: boolean;
  minute: number;
}) {
  return {
    microsoft_id: id,
    conversation_id: `${id}-thread`,
    user_email: EMAIL,
    from: { address: from },
    to_recipients: [{ address: EMAIL }],
    subject: `Receipt ${id}`,
    body_content: "Your receipt",
    parent_folder_id: folder,
    is_read: isRead,
    received_date_time: `2026-08-11T12:${String(minute).padStart(2, "0")}:00Z`,
  };
}
