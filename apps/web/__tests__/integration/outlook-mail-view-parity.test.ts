import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const EMAIL = "mail-view@example.com";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Outlook mail view parity",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: EMAIL,
        folders: [
          { id: "projects-folder", display_name: "Projects" },
          {
            id: "deleted-subfolder",
            display_name: "Old Projects",
            parent_folder_id: "deleteditems",
          },
        ],
        messages: [
          {
            microsoft_id: "project-message",
            conversation_id: "project-thread",
            user_email: EMAIL,
            from: { address: "sender@example.com" },
            to_recipients: [{ address: EMAIL }],
            subject: "Project update",
            body_content: "Update",
            parent_folder_id: "projects-folder",
            is_read: false,
            received_date_time: "2026-08-11T12:00:00Z",
          },
          {
            microsoft_id: "inbox-message",
            conversation_id: "inbox-thread",
            user_email: EMAIL,
            from: { address: "sender@example.com" },
            to_recipients: [{ address: EMAIL }],
            subject: "Inbox update",
            body_content: "Update",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-08-11T13:00:00Z",
          },
          {
            microsoft_id: "deleted-message",
            conversation_id: "deleted-thread",
            user_email: EMAIL,
            from: { address: "sender@example.com" },
            to_recipients: [{ address: EMAIL }],
            subject: "Old update",
            body_content: "Update",
            parent_folder_id: "deleteditems",
            is_read: true,
            received_date_time: "2026-08-11T11:00:00Z",
          },
          {
            microsoft_id: "deleted-subfolder-message",
            conversation_id: "deleted-subfolder-thread",
            user_email: EMAIL,
            from: { address: "sender@example.com" },
            to_recipients: [{ address: EMAIL }],
            subject: "Archived project",
            body_content: "Update",
            parent_folder_id: "deleted-subfolder",
            is_read: true,
            received_date_time: "2026-08-11T10:00:00Z",
          },
        ],
      });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("returns well-known and custom folders for the sidebar", async () => {
      const counts = await harness.provider.getFolderCounts();

      expect(counts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ systemType: "INBOX", name: "Inbox" }),
          expect.objectContaining({ id: "projects-folder", name: "Projects" }),
        ]),
      );
    });

    it("loads only threads from the selected custom folder", async () => {
      const result = await harness.provider.getThreadsWithQuery({
        query: { folderId: "projects-folder" },
      });

      expect(result.threads.map((thread) => thread.id)).toEqual([
        "project-thread",
      ]);
    });

    it("finds a sender's mail in custom folders but not in deleted items or their subfolders", async () => {
      const result = await harness.provider.getThreadsWithQuery({
        query: { type: "all", fromEmail: "sender@example.com" },
      });

      expect(result.threads.map((thread) => thread.id).sort()).toEqual([
        "inbox-thread",
        "project-thread",
      ]);
    });
  },
);
