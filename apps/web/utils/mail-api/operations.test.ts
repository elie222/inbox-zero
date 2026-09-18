import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailProviderOperationExecutor } from "./operations";
import type { EmailProvider } from "@/utils/email/types";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import prisma from "@/utils/__mocks__/prisma";
import {
  activatePreparedSnoozedThread,
  prepareSnoozedThread,
} from "@/utils/snooze/scheduler";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/durable-email-send", () => ({
  executeDurableEmailSend: vi.fn(),
}));
vi.mock("@/utils/snooze/scheduler", () => ({
  prepareSnoozedThread: vi.fn(),
  activatePreparedSnoozedThread: vi.fn(),
  cancelSnoozedThreadByClientMutationId: vi.fn(),
}));

describe("createEmailProviderOperationExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("records per-target applied and rejected outcomes in one bulk archive", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveMessages(ids: string[]) {
          if (ids.includes("missing")) throw new Error("not found 404");
        },
        async getMessage(id: string) {
          return {
            id,
            threadId: `t-${id}`,
            headers: { from: "ada@example.com", to: "me@example.com" },
            labelIds: [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const operation = metadataOperation([
      { accountId: "acc-1", messageId: "kept" },
      { accountId: "acc-1", messageId: "missing" },
    ]);
    const result = await executor.execute({
      operation,
      attemptId: "a1",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(
      result.targets.map(
        (target) => `${target.key.messageId}:${target.outcome}`,
      ),
    ).toEqual(["kept:applied", "missing:rejected"]);
  });

  it("executes sends through the existing durable receipt ledger", async () => {
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-1", threadId: "t-1" },
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(),
      attemptId: "a-send",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        input: expect.objectContaining({
          email: expect.objectContaining({
            to: "ada@example.com",
            subject: "Hi",
          }),
        }),
      }),
    );
  });

  it("inspects a persisted send receipt without sending again", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      status: "SENT",
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.inspect({
      operation: sendOperation(),
      receiptId: "receipt",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("transfers snooze ownership to the server scheduler after archive", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValue({} as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveThreadWithLabel() {},
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: {
        ...metadataOperation([{ accountId: "acc-1", messageId: "m1" }]),
        intent: {
          kind: "metadata",
          targets: [{ accountId: "acc-1", messageId: "m1" }],
          change: { kind: "snooze", untilMs: Date.now() + 60_000 },
        },
      },
      attemptId: "a-snooze",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(prepareSnoozedThread).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        threadId: "thread-1",
      }),
    );
    expect(activatePreparedSnoozedThread).toHaveBeenCalled();
  });
});

function metadataOperation(
  targets: Array<{ accountId: string; messageId: string }>,
): PreparedOperation {
  return {
    key: { accountId: "acc-1", operationId: "bulk-1" },
    session: { accountId: "acc-1", generation: "g1" },
    authority: "backend",
    payloadHash: "hash",
    intent: {
      kind: "metadata",
      targets,
      change: { kind: "archive" },
    },
  };
}

function sendOperation(): PreparedOperation {
  return {
    key: {
      accountId: "acc-1",
      operationId: "7f0c3b9e-2c1d-4d6e-9b2a-1f0e5d4c3b2a",
    },
    session: { accountId: "acc-1", generation: "g1" },
    authority: "backend",
    payloadHash: "hash",
    intent: {
      kind: "send",
      frozenDraftId: "d1",
      frozenDraftRevision: 1,
      to: ["ada@example.com"],
      cc: [],
      bcc: [],
      subject: "Hi",
      html: "<p>Hi</p>",
      quotedHtml: "",
      attachmentIds: [],
      replyToMessageId: null,
      replyToConversationId: null,
      queuedAtMs: Date.now(),
    },
  };
}
