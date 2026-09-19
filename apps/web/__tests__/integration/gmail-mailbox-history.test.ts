import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import {
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
} from "@/utils/email/mailbox-sync";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";

vi.mock("server-only", () => ({}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const EMAIL = "gmail-history@example.com";
const EXPIRED_HISTORY_ID = "1";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Gmail emulator mailbox history",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;
    let restoreFetch: (() => void) | undefined;

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        email: EMAIL,
        messages: [
          {
            id: "history-keep",
            user_email: EMAIL,
            from: "ada@example.com",
            to: EMAIL,
            subject: "Stay in inbox",
            body_text: "Keep",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: "1711900000000",
          },
        ],
      });
      const originalList = harness.gmailClient.users.history.list.bind(
        harness.gmailClient.users.history,
      );
      harness.gmailClient.users.history.list = ((params, options) => {
        if (String(params?.startHistoryId) === EXPIRED_HISTORY_ID) {
          return Promise.reject(gmailHistoryNotFound());
        }
        return originalList(params, options);
      }) as typeof originalList;

      const realFetch = globalThis.fetch;
      const emulatorOrigin = new URL(harness.emulator.url).origin;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const rewritten = rewriteGmailApiUrl(url, emulatorOrigin);
        if (rewritten === url) return realFetch(input, init);
        if (input instanceof Request) {
          return realFetch(new Request(rewritten, input), init);
        }
        return realFetch(rewritten, init);
      }) as typeof fetch;
      restoreFetch = () => {
        globalThis.fetch = realFetch;
      };
    });

    afterAll(async () => {
      restoreFetch?.();
      await harness?.emulator.close();
    });

    it("rebuilds from snapshot when Gmail history returns 404", async () => {
      const expired = encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: EXPIRED_HISTORY_ID,
        after: "1970-01-01T00:00:00.000Z",
      });
      const rebuilt = await harness.provider.getMailboxSyncPage({
        cursor: expired,
        limit: 50,
      });
      expect(rebuilt.reset).toBe(true);
      expect(rebuilt.upsertedMessages.length).toBeGreaterThan(0);
      expect(
        decodeMailboxSyncCursor(rebuilt.cursor, "google").historyId,
      ).not.toBe(EXPIRED_HISTORY_ID);

      const source = createEmailProviderMailboxSource({
        accountId: "gmail-history",
        provider: harness.provider,
      });
      const changes = await source.readChanges({
        session: { accountId: "gmail-history", generation: "g1" },
        requestId: "expired-history",
        position: {
          streamId: "primary",
          generation: "g1",
          checkpoint: expired,
        },
        pageSize: 50,
        signal: new AbortController().signal,
      });
      expect(changes).toEqual({
        status: "reset_required",
        scopeId: "primary",
      });
    });

    it("requests a rebuild when the mailbox sync cursor is invalid", async () => {
      const source = createEmailProviderMailboxSource({
        accountId: "gmail-history",
        provider: harness.provider,
      });
      const changes = await source.readChanges({
        session: { accountId: "gmail-history", generation: "g1" },
        requestId: "invalid-cursor",
        position: {
          streamId: "primary",
          generation: "g1",
          checkpoint: "not-a-cursor",
        },
        pageSize: 50,
        signal: new AbortController().signal,
      });
      expect(changes).toEqual({
        status: "reset_required",
        scopeId: "primary",
      });
    });
  },
);

function rewriteGmailApiUrl(url: string, emulatorOrigin: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== "gmail.googleapis.com") return url;
  return new URL(
    `${parsed.pathname}${parsed.search}${parsed.hash}`,
    emulatorOrigin,
  ).href;
}

function gmailHistoryNotFound() {
  return Object.assign(new Error("Requested entity was not found."), {
    code: 404,
    status: 404,
    response: {
      status: 404,
      data: {
        error: {
          code: 404,
          message: "Requested entity was not found.",
          errors: [{ reason: "notFound", message: "Not Found" }],
          status: "NOT_FOUND",
        },
      },
    },
  });
}
