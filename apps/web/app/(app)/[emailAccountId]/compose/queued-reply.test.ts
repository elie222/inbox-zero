import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationState } from "@inboxzero/mail-core/operations";
import type { QueryHandle } from "@inboxzero/mail-core/queries";
import { queueReaderEmail } from "./queued-reply";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";

const staging = vi.hoisted(() => vi.fn());

vi.mock("@/utils/mail-engine/stage-attachments", () => ({
  stageSendAttachments: staging,
}));

describe("queueReaderEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staging.mockResolvedValue([]);
  });

  it("returns immediately after durably queueing while offline", async () => {
    const client = createClient();
    const outcome = await queueReaderEmail({
      client,
      email: createEmail(),
      emailAccountId: "account-two",
      messageIds: ["message"],
      online: false,
      threadId: "thread",
    });

    expect(client.saveDraft).toHaveBeenCalledOnce();
    expect(client.submitSend).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "thread",
        replyTo: { accountId: "account-two", messageId: "message" },
        notBeforeMs: expect.any(Number),
      }),
    );
    const notBeforeMs = client.submitSend.mock.calls[0]?.[0]?.notBeforeMs;
    expect(notBeforeMs).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
    expect(outcome).toEqual({
      reason: "offline",
      status: "queued",
      threadId: "thread",
    });
    expect(client.observeOperation).not.toHaveBeenCalled();
  });

  it("admits a new message without a reply target", async () => {
    const client = createClient();
    await queueReaderEmail({
      client,
      email: createEmail(),
      emailAccountId: "account-two",
      messageIds: [],
      online: false,
      threadId: "compose:new-message",
    });
    expect(client.submitSend).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "compose:new-message",
        replyTo: null,
      }),
    );
  });

  it("freezes the provider draft id into the sendable engine draft", async () => {
    const client = createClient();
    await queueReaderEmail({
      client,
      email: { ...createEmail(), providerDraftId: "gmail-draft-1" },
      emailAccountId: "account-two",
      messageIds: [],
      online: false,
      threadId: "compose:new-message",
    });
    expect(client.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          providerDraftId: "gmail-draft-1",
        }),
      }),
    );
  });

  it("reuses a draft identity and refuses a conflicting send payload", async () => {
    const client = createClient();
    client.submitSend.mockResolvedValue({
      status: "rejected",
      code: "invalid",
    });
    await expect(
      queueReaderEmail({
        client,
        email: { ...createEmail(), messageHtml: "Changed" },
        emailAccountId: "account",
        messageIds: ["message"],
        mutationId: "mutation",
        online: false,
        threadId: "thread",
      }),
    ).rejects.toThrow("different content");
  });

  it("explains a full command queue instead of a generic send failure", async () => {
    const client = createClient();
    client.submitSend.mockResolvedValue({
      status: "rejected",
      code: "queue_full",
    });
    await expect(
      queueReaderEmail({
        client,
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: false,
        threadId: "thread",
      }),
    ).rejects.toThrow(admissionRejectionCopy("queue_full"));
  });

  it("observes the persisted provider result while online", async () => {
    const handle = createHandle({ status: "executing" });
    const client = createClient({ handle });
    const pending = queueReaderEmail({
      client,
      email: createEmail(),
      emailAccountId: "account",
      messageIds: ["message"],
      online: true,
      settlementTimeoutMs: 1000,
      threadId: "thread",
    });
    await vi.waitFor(() => expect(handle.subscribe).toHaveBeenCalled());
    handle.set({ status: "succeeded" });
    await expect(pending).resolves.toEqual({
      messageId: "",
      status: "sent",
      threadId: "thread",
    });
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("does not turn an uncertain delivery into an automatic retry", async () => {
    const client = createClient({
      handle: createHandle({ status: "uncertain" }),
    });
    await expect(
      queueReaderEmail({
        client,
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      ownsNotification: true,
      status: "uncertain",
      threadId: "thread",
    });
  });

  it("returns the persisted terminal failure", async () => {
    const client = createClient({
      handle: createHandle({
        status: "failed",
        error: { code: "Provider rejected the email", retryable: false },
      }),
    });
    await expect(
      queueReaderEmail({
        client,
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      error: "Provider rejected the email",
      ownsNotification: true,
      status: "failed",
    });
  });

  it("holds an online send so undo can cancel it before delivery", async () => {
    const holdUntil = Date.now() + 5000;
    const onQueued = vi.fn();
    const client = createClient();

    await expect(
      queueReaderEmail({
        client,
        email: createEmail(),
        emailAccountId: "account",
        holdUntil,
        messageIds: ["message"],
        mutationId: "mutation",
        onQueued,
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      holdUntil,
      mutationId: "mutation",
      status: "held",
      threadId: "thread",
    });
    expect(client.submitSend).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "mutation",
        notBeforeMs: holdUntil,
      }),
    );
    expect(onQueued).toHaveBeenCalledOnce();
    expect(client.observeOperation).not.toHaveBeenCalled();
  });

  it("still holds when submitSend outlasts the undo window", async () => {
    const holdUntil = Date.now() + 20;
    const client = createClient();
    client.submitSend.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { status: "queued" };
    });

    await expect(
      queueReaderEmail({
        client,
        email: createEmail(),
        emailAccountId: "account",
        holdUntil,
        messageIds: ["message"],
        mutationId: "mutation",
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      holdUntil,
      mutationId: "mutation",
      status: "held",
      threadId: "thread",
    });
    expect(client.observeOperation).not.toHaveBeenCalled();
  });

  it("explains when the queued email is waiting for account reconnection", async () => {
    const client = createClient({
      handle: createHandle({ status: "blocked_auth" }),
    });
    await expect(
      queueReaderEmail({
        client,
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      reason: "blocked_auth",
      status: "queued",
      threadId: "thread",
    });
  });

  it("keeps a slow online send queued instead of resubmitting it", async () => {
    vi.useFakeTimers();
    const client = createClient({
      handle: createHandle({ status: "queued" }),
    });
    const pending = queueReaderEmail({
      client,
      email: createEmail(),
      emailAccountId: "account",
      messageIds: ["message"],
      online: true,
      settlementTimeoutMs: 100,
      threadId: "thread",
    });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual({
      reason: "pending",
      status: "queued",
      threadId: "thread",
    });
    vi.useRealTimers();
  });
});

function createEmail() {
  return {
    messageHtml: "<p>Hello</p>",
    subject: "Re: Hello",
    to: "person@example.com",
  };
}

function createClient(options?: { handle?: ReturnType<typeof createHandle> }) {
  return {
    observeOperation: vi.fn(() => options?.handle ?? createHandle()),
    saveDraft: vi.fn().mockResolvedValue({
      status: "saved",
      draftRevision: 1,
    }),
    readDraft: vi.fn().mockResolvedValue({ status: "missing" }),
    submitSend: vi.fn().mockResolvedValue({ status: "queued" }),
  } as {
    observeOperation: ReturnType<typeof vi.fn>;
    saveDraft: ReturnType<typeof vi.fn>;
    readDraft: ReturnType<typeof vi.fn>;
    submitSend: ReturnType<typeof vi.fn>;
  } & import("@inboxzero/mail-core/engine").MailClient;
}

function createHandle(initial?: Partial<OperationState>) {
  let listener: (() => void) | undefined;
  let data: OperationState | null = initial ? operationState(initial) : null;
  const handle: QueryHandle<OperationState> & {
    set: (next: Partial<OperationState>) => void;
    subscribe: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } = {
    getSnapshot: () => ({
      status: data ? "ready" : "loading",
      revision: null,
      data,
      refreshing: false,
      error: null,
    }),
    subscribe: vi.fn((next: () => void) => {
      listener = next;
      return vi.fn();
    }),
    close: vi.fn(),
    set(next) {
      data = operationState(next);
      listener?.();
    },
  };
  return handle;
}

function operationState(partial: Partial<OperationState>): OperationState {
  return {
    key: { accountId: "account", operationId: "mutation" },
    status: "queued",
    authority: "backend",
    attempts: 0,
    nextAttemptAtMs: null,
    error: null,
    ...partial,
  };
}
