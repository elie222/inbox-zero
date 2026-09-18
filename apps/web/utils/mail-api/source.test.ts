import { describe, expect, it, vi } from "vitest";
import {
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
  InvalidMailboxSyncCursorError,
} from "@/utils/email/mailbox-sync";
import { ProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { createEmailProviderMailboxSource } from "./source";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

describe("createEmailProviderMailboxSource", () => {
  it("requests a scoped rebuild when the provider cursor is expired", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage() {
          throw new InvalidMailboxSyncCursorError();
        },
        async getMessagesWithPagination() {
          throw new InvalidMailboxSyncCursorError();
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "expired",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "reset_required",
      scopeId: "primary",
    });
  });

  it("treats an explicit reset page as expired history", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        async getMailboxSyncPage() {
          return {
            reset: true,
            cursor: "",
            upsertedMessages: [],
            deletedMessageIds: [],
            hasMore: false,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "inbox",
        generation: "g1",
        checkpoint: "delta",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "reset_required",
      scopeId: "inbox",
    });
  });

  it("pauses catch-up when the provider is throttled", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage() {
          throw new ProviderRateLimitModeError({ provider: "google" });
        },
        async getMessagesWithPagination() {
          throw new ProviderRateLimitModeError({ provider: "google" });
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "1",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "paused",
      reason: "throttled",
    });
  });

  it("pages conversation membership instead of truncating the thread", async () => {
    const messages = Array.from({ length: 3 }, (_, index) => ({
      id: `m${index + 1}`,
      threadId: "c1",
      headers: { from: "ada@example.com" },
      labelIds: ["INBOX"],
      snippet: `m${index + 1}`,
    }));
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getThread() {
          return { messages, historyId: "h1" };
        },
      } as unknown as EmailProvider,
    });
    const first = await source.readConversationMembership({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      conversation: { accountId: "acc-1", conversationId: "c1" },
      resolutionId: "res",
      page: null,
      pageSize: 2,
    });
    expect(first).toMatchObject({
      status: "ok",
      value: {
        status: "page",
        page: {
          nextPage: "2",
          keys: [
            { accountId: "acc-1", messageId: "m1" },
            { accountId: "acc-1", messageId: "m2" },
          ],
        },
      },
    });
    const second = await source.readConversationMembership({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r2",
      signal: new AbortController().signal,
      conversation: { accountId: "acc-1", conversationId: "c1" },
      resolutionId: "res",
      page: "2",
      pageSize: 2,
    });
    expect(second).toMatchObject({
      status: "ok",
      value: {
        status: "page",
        page: {
          nextPage: null,
          keys: [{ accountId: "acc-1", messageId: "m3" }],
        },
      },
    });
  });

  it("enumerates mailbox pages including drafts", async () => {
    const getMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        getMessagesWithPagination,
        async getMailboxSyncPage() {
          return {
            cursor: "gmail-cursor",
            reset: true,
            upsertedMessages: [],
            deletedMessageIds: [],
            hasMore: false,
          };
        },
      } as unknown as EmailProvider,
    });
    await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 50,
    });
    expect(getMessagesWithPagination).toHaveBeenCalledWith({
      maxResults: 50,
      pageToken: undefined,
      includeDrafts: true,
    });
  });

  it("stores a provider history cursor when enumeration finishes", async () => {
    const cursor = encodeMailboxSyncCursor({
      version: 1,
      provider: "google",
      phase: "delta",
      historyId: "42",
      after: "1970-01-01T00:00:00.000Z",
    });
    const getMailboxSyncPage = vi.fn().mockResolvedValue({
      cursor,
      reset: true,
      upsertedMessages: [],
      deletedMessageIds: [],
      hasMore: false,
    });
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        getMailboxSyncPage,
        async getMessagesWithPagination() {
          return {
            messages: [
              {
                id: "m1",
                threadId: "t1",
                historyId: "9",
                headers: { from: "ada@example.com" },
                labelIds: ["INBOX"],
                snippet: "Hi",
              },
            ],
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 50,
    });
    expect(result).toMatchObject({
      status: "ok",
      value: {
        nextPage: null,
        catchUpFrom: {
          streamId: "primary",
          generation: "g1",
          checkpoint: cursor,
        },
      },
    });
    expect(getMailboxSyncPage).toHaveBeenCalledWith({
      after: new Date(0),
      limit: 1,
    });
  });

  it("encodes the newest Gmail history id when the provider cursor is unavailable", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMailboxSyncPage() {
          throw new Error("profile unavailable");
        },
        async getMessagesWithPagination() {
          return {
            messages: [
              {
                id: "old",
                threadId: "t1",
                historyId: "10",
                headers: { from: "ada@example.com" },
                labelIds: ["INBOX"],
                snippet: "Old",
              },
              {
                id: "new",
                threadId: "t2",
                historyId: "99",
                headers: { from: "ada@example.com" },
                labelIds: ["INBOX"],
                snippet: "New",
              },
            ],
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 50,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.value.nextPage).toBeNull();
    if (result.value.nextPage !== null) throw new Error("expected last page");
    expect(
      decodeMailboxSyncCursor(
        result.value.catchUpFrom.checkpoint ?? "",
        "google",
      ),
    ).toMatchObject({
      historyId: "99",
      phase: "delta",
      provider: "google",
    });
  });

  it("blocks catch-up when provider authentication fails", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage() {
          throw new Error("401 unauthorized");
        },
        async getMessagesWithPagination() {
          throw new Error("401 unauthorized");
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "1",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ status: "blocked_auth" });
  });
});
