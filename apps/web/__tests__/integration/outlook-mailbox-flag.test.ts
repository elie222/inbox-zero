import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const EMAIL = "outlook-flag@example.com";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Outlook emulator message flags",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: EMAIL,
        messages: [
          {
            microsoft_id: "flag-keep",
            conversation_id: "flag-keep-thread",
            user_email: EMAIL,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: EMAIL }],
            subject: "Flag this later",
            body_content: "Inbox",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-09-18T12:00:00Z",
          },
        ],
      });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("persists Graph flag patches and maps them to STARRED", async () => {
      const first = await harness.provider.getMailboxSyncPage({
        after: new Date(0),
        limit: 50,
      });
      const message = first.upsertedMessages.find(
        (entry) => entry.subject === "Flag this later",
      );
      expect(message?.id).toBeTruthy();
      expect(message?.labelIds).not.toContain("STARRED");

      await harness.provider.markMessagesStarredState([message!.id], true);

      const flagged = await harness.graphClient
        .api(`/me/messages/${message!.id}`)
        .get();
      expect(flagged.flag).toEqual({ flagStatus: "flagged" });

      const starredPage = await harness.provider.getMailboxSyncPage({
        after: new Date(0),
        limit: 50,
      });
      expect(
        starredPage.upsertedMessages.find((entry) => entry.id === message!.id)
          ?.labelIds,
      ).toContain("STARRED");

      const filtered = await harness.graphClient
        .api("/me/messages")
        .filter("flag/flagStatus eq 'flagged'")
        .get();
      expect(filtered.value.map((entry: { id: string }) => entry.id)).toEqual([
        message!.id,
      ]);

      await harness.provider.markMessagesStarredState([message!.id], false);

      const cleared = await harness.graphClient
        .api(`/me/messages/${message!.id}`)
        .get();
      expect(cleared.flag).toEqual({ flagStatus: "notFlagged" });
    });
  },
);
