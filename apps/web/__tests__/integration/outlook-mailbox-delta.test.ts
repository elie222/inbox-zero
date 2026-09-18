import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";
import { decodeMailboxSyncCursor } from "@/utils/email/mailbox-sync";

vi.mock("server-only", () => ({}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const EMAIL = "outlook-delta@example.com";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Outlook emulator folder delta",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: EMAIL,
        messages: [
          {
            microsoft_id: "delta-keep",
            conversation_id: "delta-keep-thread",
            user_email: EMAIL,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: EMAIL }],
            subject: "Stay in inbox",
            body_content: "Keep",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-09-18T12:00:00Z",
          },
          {
            microsoft_id: "delta-move",
            conversation_id: "delta-move-thread",
            user_email: EMAIL,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: EMAIL }],
            subject: "Leave inbox",
            body_content: "Move",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-09-18T11:00:00Z",
          },
        ],
      });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("returns a graph.microsoft.com delta cursor and later folder moves", async () => {
      const deltaRequests: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.includes("messages/delta")) deltaRequests.push(url);
        return originalFetch(input, init);
      }) as typeof fetch;

      const first = await harness.provider.getMailboxSyncPage({
        after: new Date(0),
        limit: 50,
      });
      const firstCursor = decodeMailboxSyncCursor(first.cursor, "microsoft");
      const deltaUrl = new URL(firstCursor.deltaLink);

      expect(deltaUrl.protocol).toBe("https:");
      expect(deltaUrl.hostname).toBe("graph.microsoft.com");
      expect(deltaUrl.pathname).toBe(
        "/v1.0/me/mailFolders/inbox/messages/delta",
      );
      expect(deltaUrl.searchParams.has("$deltatoken")).toBe(true);
      expect(first.hasMore).toBe(false);
      expect(first.upsertedMessages.map((message) => message.subject)).toEqual(
        expect.arrayContaining(["Stay in inbox", "Leave inbox"]),
      );
      const keepId = first.upsertedMessages.find(
        (message) => message.subject === "Stay in inbox",
      )?.id;
      const moveId = first.upsertedMessages.find(
        (message) => message.subject === "Leave inbox",
      )?.id;
      expect(keepId).toBeTruthy();
      expect(moveId).toBeTruthy();

      const idle = await harness.provider.getMailboxSyncPage({
        cursor: first.cursor,
        limit: 50,
      });
      expect(
        decodeMailboxSyncCursor(idle.cursor, "microsoft").deltaLink,
      ).toMatch(
        /^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/mailFolders\/inbox\/messages\/delta\?\$deltatoken=/,
      );
      expect(idle.hasMore).toBe(false);

      await harness.provider.archiveMessages([moveId!]);

      const changed = await harness.provider.getMailboxSyncPage({
        cursor: idle.cursor,
        limit: 50,
      });
      const moved = changed.upsertedMessages.find(
        (message) => message.id === moveId,
      );

      expect(deltaRequests.length).toBeGreaterThanOrEqual(3);
      expect(deltaRequests[0]).not.toContain("$deltatoken=");
      expect(
        deltaRequests.slice(1).every((url) => url.includes("$deltatoken=")),
      ).toBe(true);
      expect(moved?.labelIds).not.toContain("INBOX");
      expect(moved?.labelIds).toContain("ARCHIVE");
      expect(
        changed.upsertedMessages.some(
          (message) =>
            message.id === keepId && message.labelIds?.includes("INBOX"),
        ),
      ).toBe(true);
    });
  },
);
