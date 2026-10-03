import { beforeEach, expect, it, vi } from "vitest";
import { Prisma, type EmailDraftResource } from "@/generated/prisma/client";
import type { ScheduledEmail } from "@/generated/prisma/client";
import { createHash } from "node:crypto";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { executeDurableEmailSend } from "./durable-email-send";
import prisma from "@/utils/__mocks__/prisma";
import {
  scheduleEmail,
  cancelScheduledEmail,
  holdEmailForUndo,
} from "@/utils/scheduled-email/service";
import type { EmailProvider } from "@/utils/email/types";
import {
  createDraftResource,
  discardDraftResource,
  claimDraftResourceForSend,
  registerDraftResource,
  releaseCancelledDraftResource,
  updateDraftResource,
  readDraftResource,
  leaseDraftResourceForSend,
} from "./draft-resource";

vi.mock("@/utils/prisma");
const { providerSend } = vi.hoisted(() => ({ providerSend: vi.fn() }));
vi.mock("@/utils/email/sent-message-open/sent-message-open.server", () => ({
  sendHtmlEmailWithOpenTracking: providerSend,
}));

const content = {
  to: "you@example.com",
  subject: "Subject",
  messageHtml: "<p>Body</p>",
};
const provider = {
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
  deleteDraft: vi.fn(),
} as unknown as EmailProvider;
let rows: EmailDraftResource[];
let schedules: ScheduledEmail[];

function matches(
  row: EmailDraftResource,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, value]) => {
    const actual = row[key as keyof EmailDraftResource];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const check = value as { in?: unknown[]; lte?: Date };
      if (check.in) return check.in.includes(actual);
      if (check.lte) return actual instanceof Date && actual <= check.lte;
    }
    return actual === value;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  rows = [];
  schedules = [];
  providerSend.mockResolvedValue({ messageId: "sent", threadId: "thread" });
  prisma.emailSendOperation.findUnique.mockResolvedValue(null);
  prisma.emailSendOperation.create.mockImplementation(
    async ({ data }) =>
      ({
        id: "send-operation",
        status: "PROCESSING",
        ...data,
      }) as never,
  );
  prisma.emailDraftResource.findUnique.mockImplementation(async ({ where }) => {
    if (where.id) return rows.find((row) => row.id === where.id) ?? null;
    const identity =
      where.emailAccountId_resourceKey ?? where.emailAccountId_providerDraftId;
    return rows.find((row) => identity && matches(row, identity)) ?? null;
  });
  prisma.emailDraftResource.create.mockImplementation(async ({ data }) => {
    const row = {
      id: `row-${rows.length}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      resourceKey: data.resourceKey,
      emailAccountId: data.emailAccountId,
      owner: "DRAFT",
      state: "NOT_CREATED",
      sendOperationId: null,
      providerDraftId: null,
      providerMessageId: null,
      providerThreadId: null,
      leaseId: null,
      leaseStartedAt: null,
      canonicalResourceId: null,
      ...data,
    } as EmailDraftResource;
    if (
      rows.some(
        (old) =>
          old.emailAccountId === row.emailAccountId &&
          (old.resourceKey === row.resourceKey ||
            (row.providerDraftId &&
              old.providerDraftId === row.providerDraftId)),
      )
    ) {
      throw new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      });
    }
    rows.push(row);
    return row;
  });
  prisma.emailDraftResource.updateMany.mockImplementation(
    async ({ where, data }) => {
      const found = rows.filter((row) =>
        matches(row, where as Record<string, unknown>),
      );
      if (
        data.providerDraftId &&
        found.some((row) =>
          rows.some(
            (other) =>
              other.id !== row.id &&
              other.emailAccountId === row.emailAccountId &&
              other.providerDraftId === data.providerDraftId,
          ),
        )
      )
        throw new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        });
      for (const row of found) Object.assign(row, data);
      return { count: found.length };
    },
  );
  prisma.$executeRaw.mockImplementation(
    async (_query, sourceID, leaseId, accountId, canonicalID, providerID) => {
      const source = rows.find(
        (row) =>
          row.id === sourceID &&
          row.leaseId === leaseId &&
          row.emailAccountId === accountId &&
          !row.canonicalResourceId &&
          !row.providerDraftId,
      );
      const root = rows.find(
        (row) =>
          row.id === canonicalID &&
          row.providerDraftId === providerID &&
          row.emailAccountId === accountId &&
          !row.canonicalResourceId,
      );
      if (!source || !root) return 0;
      if (root.owner === "DRAFT") {
        root.owner = source.owner;
        root.sendOperationId = source.sendOperationId;
      }
      source.canonicalResourceId = root.id;
      source.state = "CONSUMED";
      source.leaseId = null;
      source.leaseStartedAt = null;
      return 1;
    },
  );
  prisma.scheduledEmail.findUnique.mockImplementation(async ({ where }) => {
    const identity = where.emailAccountId_clientMutationId;
    return (
      schedules.find((row) =>
        identity
          ? row.emailAccountId === identity.emailAccountId &&
            row.clientMutationId === identity.clientMutationId
          : row.id === where.id,
      ) ?? null
    );
  });
  prisma.$queryRaw.mockImplementation(
    async (
      _query,
      rootID,
      accountId,
      operationID,
      scheduleID,
      _account,
      _operation,
      payloadHash,
      payload,
      threadId,
      sendAt,
      remindAt,
      _remind,
      heldForUndo,
    ) => {
      const root = rows.find(
        (row) =>
          row.id === rootID &&
          row.emailAccountId === accountId &&
          !row.canonicalResourceId &&
          row.state !== "CONSUMED" &&
          (row.owner === "DRAFT" ||
            (row.owner === "SEND" && row.sendOperationId === operationID)),
      );
      if (
        !root ||
        schedules.some(
          (row) =>
            row.emailAccountId === accountId &&
            row.clientMutationId === operationID,
        )
      )
        return [] as never;
      const schedule = {
        id: scheduleID,
        emailAccountId: accountId,
        clientMutationId: operationID,
        payloadHash,
        payload: JSON.parse(String(payload)),
        threadId,
        sendAt,
        remindAt,
        heldForUndo,
        status: "PENDING",
      } as ScheduledEmail;
      schedules.push(schedule);
      root.owner = "SEND";
      root.sendOperationId = String(operationID);
      return [schedule] as never;
    },
  );
  vi.mocked(provider.createDraft).mockResolvedValue({ id: "provider-draft" });
  vi.mocked(provider.updateDraft).mockResolvedValue(undefined);
  vi.mocked(provider.getDraft).mockResolvedValue({
    id: "message",
    threadId: "thread",
  } as never);
  vi.mocked(provider.getDraftReferenceForMessage).mockResolvedValue({
    id: "provider-draft",
    version: "v1",
  });
  vi.mocked(provider.deleteDraft).mockResolvedValue(true);
});

const input = () => ({
  accountId: "account",
  resourceKey: "local-draft",
  content,
  provider,
});

it("recovers the persisted provider ID after a lost successful response without creating again", async () => {
  const saved = await createDraftResource(input());
  expect(saved.providerDraftId).toBe("provider-draft");
  expect(rows[0].providerDraftId).toBe("provider-draft");
  expect(await createDraftResource(input())).toMatchObject({
    state: "READY",
    providerDraftId: "provider-draft",
  });
  expect(provider.createDraft).toHaveBeenCalledOnce();
});

it("does not blindly create again after the provider outcome becomes unknown", async () => {
  vi.mocked(provider.createDraft).mockRejectedValueOnce(
    new Error("lost response"),
  );
  expect(await createDraftResource(input())).toMatchObject({
    state: "UNCERTAIN",
    providerDraftId: null,
  });
  expect(await createDraftResource(input())).toMatchObject({
    state: "UNCERTAIN",
  });
  expect(provider.createDraft).toHaveBeenCalledOnce();
});

it("retains a known ID and blocks send after an uncertain provider update", async () => {
  await createDraftResource(input());
  vi.mocked(provider.updateDraft).mockRejectedValueOnce(new Error("timeout"));
  expect(await updateDraftResource(input())).toMatchObject({
    state: "UNCERTAIN",
    providerDraftId: "provider-draft",
  });
  expect(
    await claimDraftResourceForSend({ ...input(), sendOperationId: "send" }),
  ).toMatchObject({ status: "uncertain" });
});

it("registers a mailbox draft under one canonical resource across devices", async () => {
  const first = await registerDraftResource({
    accountId: "account",
    resourceKey: "device-one",
    providerDraftId: "existing",
  });
  const second = await registerDraftResource({
    accountId: "account",
    resourceKey: "device-two",
    providerDraftId: "existing",
  });
  expect(second.resourceKey).toBe(first.resourceKey);
  expect(rows).toHaveLength(1);
  expect(provider.createDraft).not.toHaveBeenCalled();
});

it("rejects reusing a local key for a different provider draft", async () => {
  await registerDraftResource({
    accountId: "account",
    resourceKey: "key",
    providerDraftId: "first",
  });
  await expect(
    registerDraftResource({
      accountId: "account",
      resourceKey: "key",
      providerDraftId: "second",
    }),
  ).rejects.toThrow("different");
});

it("lets send own a late create result without deleting the draft being sent", async () => {
  let finish!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const creating = createDraftResource(input());
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(
    await claimDraftResourceForSend({ ...input(), sendOperationId: "send" }),
  ).toMatchObject({ status: "retry" });
  finish({ id: "provider-draft" });
  expect(await creating).toMatchObject({
    owner: "SEND",
    providerDraftId: "provider-draft",
  });
  expect(provider.deleteDraft).not.toHaveBeenCalled();
});

it("durably owns and cleans up a create that finishes after discard", async () => {
  let finish!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const creating = createDraftResource(input());
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(await discardDraftResource(input())).toMatchObject({
    owner: "DISCARD",
    state: "CREATING",
  });
  finish({ id: "provider-draft" });
  expect(await creating).toMatchObject({ state: "CONSUMED", owner: "DISCARD" });
  expect(provider.deleteDraft).toHaveBeenCalledWith("provider-draft", "v1");
});

it("send arriving before draft creation prevents a later provider create", async () => {
  expect(
    await claimDraftResourceForSend({ ...input(), sendOperationId: "send" }),
  ).toMatchObject({ status: "ready" });
  expect(await createDraftResource(input())).toMatchObject({
    owner: "SEND",
    state: "NOT_CREATED",
  });
  expect(provider.createDraft).not.toHaveBeenCalled();
});

it("concurrent create requests share a single provider call", async () => {
  let finish!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = createDraftResource(input());
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(await createDraftResource(input())).toMatchObject({
    state: "CREATING",
  });
  finish({ id: "provider-draft" });
  await first;
  expect(provider.createDraft).toHaveBeenCalledOnce();
});

it("confirmed cancellation during create preserves the active lease and releases the late ID to Drafts", async () => {
  let finish!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const creating = createDraftResource(input());
  await vi.waitFor(() => expect(finish).toBeDefined());
  await claimDraftResourceForSend({
    ...input(),
    sendOperationId: "cancelled-send",
  });
  const lease = rows[0].leaseId;
  await releaseCancelledDraftResource("account", "cancelled-send");
  expect(rows[0]).toMatchObject({
    owner: "DRAFT",
    state: "CREATING",
    leaseId: lease,
  });
  finish({ id: "provider-draft" });
  expect(await creating).toMatchObject({
    owner: "DRAFT",
    state: "READY",
    providerDraftId: "provider-draft",
  });
  await updateDraftResource(input());
  expect(provider.createDraft).toHaveBeenCalledOnce();
  expect(provider.updateDraft).toHaveBeenCalledOnce();
});

it("confirmed cancellation during update preserves its lease until the actual result", async () => {
  await createDraftResource(input());
  let finish!: () => void;
  vi.mocked(provider.updateDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const updating = updateDraftResource(input());
  await vi.waitFor(() => expect(finish).toBeDefined());
  await claimDraftResourceForSend({
    ...input(),
    sendOperationId: "cancelled-send",
  });
  const lease = rows[0].leaseId;
  await releaseCancelledDraftResource("account", "cancelled-send");
  expect(rows[0]).toMatchObject({ owner: "DRAFT", leaseId: lease });
  finish();
  expect(await updating).toMatchObject({
    owner: "DRAFT",
    state: "READY",
    leaseId: null,
  });
});

it("cancellation does not replay an unknown provider write or release another send's owner", async () => {
  vi.mocked(provider.createDraft).mockRejectedValueOnce(new Error("timeout"));
  await createDraftResource(input());
  await claimDraftResourceForSend({
    ...input(),
    sendOperationId: "current-send",
  });
  await releaseCancelledDraftResource("account", "old-send");
  expect(rows[0].owner).toBe("SEND");
  await releaseCancelledDraftResource("account", "current-send");
  expect(rows[0]).toMatchObject({ state: "UNCERTAIN", owner: "DRAFT" });
  await createDraftResource(input());
  expect(provider.createDraft).toHaveBeenCalledOnce();
});

it("concurrent first registration converges on one database identity", async () => {
  const input = {
    accountId: "account",
    resourceKey: "same",
    providerDraftId: "same-provider-id",
  };
  const registered = await Promise.all([
    registerDraftResource(input),
    registerDraftResource(input),
  ]);
  expect(registered[0].id).toBe(registered[1].id);
  expect(rows).toHaveLength(1);
});

it("resolves the actual draft ID inside send without changing the immutable payload hash", async () => {
  await createDraftResource(input());
  const email = { ...content, draftResourceKey: "local-draft" };
  const queuedAt = Date.now();
  const wire = {
    mutationId: "send-one",
    queuedAt,
    threadId: null,
    messageIds: ["local-draft"],
    email,
  };
  const outcome = await executeDurableEmailSend({
    emailAccountId: "account",
    provider: "google",
    getEmailProvider: async () => provider,
    logger: createScopedLogger("draft-resource-test"),
    input: wire,
  });
  expect(outcome.status).toBe("applied");
  expect(providerSend).toHaveBeenCalledWith(
    expect.objectContaining({
      email: expect.objectContaining({
        draftResourceKey: "local-draft",
        providerDraftId: "provider-draft",
        messageHtml: content.messageHtml,
      }),
    }),
  );
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        threadId: null,
        messageIds: ["local-draft"],
        email,
        queuedAt,
      }),
    )
    .digest("hex");
  expect(prisma.emailSendOperation.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ payloadHash }) }),
  );
  expect(email).not.toHaveProperty("providerDraftId");
  expect(rows[0]).toMatchObject({ state: "CONSUMED", owner: "SEND" });
});

it("a definite pre-send rejection releases the old owner for editing and a new operation retry", async () => {
  await createDraftResource(input());
  providerSend.mockRejectedValueOnce(new SafeError("Sending disabled."));
  const makeSend = (mutationId: string) =>
    executeDurableEmailSend({
      emailAccountId: "account",
      provider: "google",
      getEmailProvider: async () => provider,
      logger: createScopedLogger("draft-resource-test"),
      input: {
        mutationId,
        queuedAt: Date.now(),
        threadId: null,
        messageIds: ["local-draft"],
        email: { ...content, draftResourceKey: "local-draft" },
      },
    });
  expect(await makeSend("rejected-send")).toMatchObject({ status: "rejected" });
  expect(rows[0]).toMatchObject({
    state: "READY",
    owner: "DRAFT",
    sendOperationId: null,
    leaseId: null,
  });
  await updateDraftResource(input());
  expect(provider.updateDraft).toHaveBeenCalledOnce();
  expect(await makeSend("new-send")).toMatchObject({ status: "applied" });
  expect(providerSend).toHaveBeenCalledTimes(2);
  expect(provider.createDraft).toHaveBeenCalledOnce();
});

it("an unexplained send failure protects the provider resource against a new blind send", async () => {
  await createDraftResource(input());
  providerSend.mockRejectedValueOnce(new Error("socket lost after dispatch"));
  const makeSend = (mutationId: string) =>
    executeDurableEmailSend({
      emailAccountId: "account",
      provider: "google",
      getEmailProvider: async () => provider,
      logger: createScopedLogger("draft-resource-test"),
      input: {
        mutationId,
        queuedAt: Date.now(),
        threadId: null,
        messageIds: ["local-draft"],
        email: { ...content, draftResourceKey: "local-draft" },
      },
    });
  expect(await makeSend("unknown-send")).toMatchObject({ status: "uncertain" });
  expect(rows[0]).toMatchObject({ state: "UNCERTAIN", owner: "SEND" });
  expect(await makeSend("new-send")).toMatchObject({ status: "rejected" });
  expect(providerSend).toHaveBeenCalledOnce();
});

it("a scheduled send owns a pending create and confirmed cancellation returns its late result to Drafts", async () => {
  let finishCreate!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCreate = resolve;
      }),
  );
  const creating = createDraftResource(input());
  await vi.waitFor(() => expect(provider.createDraft).toHaveBeenCalledOnce());
  prisma.scheduledEmail.findUnique.mockResolvedValue(null);
  prisma.scheduledEmail.create.mockResolvedValue({
    id: "schedule",
    status: "PENDING",
  } as never);
  await scheduleEmail("account", {
    clientMutationId: "scheduled-send",
    threadId: null,
    messageIds: [],
    email: { ...content, draftResourceKey: "local-draft" },
    sendAt: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(rows[0]).toMatchObject({
    owner: "SEND",
    state: "CREATING",
    sendOperationId: "scheduled-send",
  });
  expect(providerSend).not.toHaveBeenCalled();
  const leaseId = rows[0].leaseId;
  prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
  prisma.scheduledEmail.findUnique.mockResolvedValue({
    clientMutationId: "scheduled-send",
    status: "CANCELLED",
  } as never);
  await cancelScheduledEmail("account", "schedule");
  expect(rows[0]).toMatchObject({
    owner: "DRAFT",
    state: "CREATING",
    leaseId,
    sendOperationId: null,
  });
  finishCreate({ id: "provider-draft" });
  expect(await creating).toMatchObject({
    owner: "DRAFT",
    state: "READY",
    providerDraftId: "provider-draft",
  });
  await updateDraftResource(input());
  expect(provider.updateDraft).toHaveBeenCalledOnce();
});

it("an executing scheduled send cannot release its resource through cancellation", async () => {
  await createDraftResource(input());
  await claimDraftResourceForSend({
    accountId: "account",
    resourceKey: "local-draft",
    sendOperationId: "scheduled-send",
  });
  prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });
  await expect(cancelScheduledEmail("account", "schedule")).rejects.toThrow(
    "started sending",
  );
  expect(rows[0]).toMatchObject({
    owner: "SEND",
    sendOperationId: "scheduled-send",
  });
});

it("reconciles a durable scheduled cancellation after its resource release failed", async () => {
  await createDraftResource(input());
  await claimDraftResourceForSend({
    accountId: "account",
    resourceKey: "local-draft",
    sendOperationId: "scheduled-send",
  });
  prisma.scheduledEmail.updateMany
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 0 });
  prisma.scheduledEmail.findUnique.mockResolvedValue({
    clientMutationId: "scheduled-send",
    status: "CANCELLED",
  } as never);
  prisma.emailDraftResource.updateMany.mockRejectedValueOnce(
    new Error("release write failed"),
  );
  await expect(cancelScheduledEmail("account", "schedule")).rejects.toThrow(
    "release write failed",
  );
  expect(rows[0]).toMatchObject({
    owner: "SEND",
    sendOperationId: "scheduled-send",
  });
  await cancelScheduledEmail("account", "schedule");
  expect(rows[0]).toMatchObject({ owner: "DRAFT", sendOperationId: null });
  await updateDraftResource(input());
  expect(provider.updateDraft).toHaveBeenCalledOnce();
});

it("reconciles a known sent result after resource completion failed without another provider send", async () => {
  await createDraftResource(input());
  const sendInput = {
    mutationId: "sent-operation",
    queuedAt: Date.now(),
    threadId: null,
    messageIds: [],
    email: { ...content, draftResourceKey: "local-draft" },
  };
  let sent: Record<string, unknown> | undefined;
  prisma.emailSendOperation.update.mockImplementation(async ({ data }) => {
    sent = {
      payloadHash: createHash("sha256")
        .update(
          JSON.stringify({
            threadId: sendInput.threadId,
            messageIds: sendInput.messageIds,
            email: sendInput.email,
            queuedAt: sendInput.queuedAt,
          }),
        )
        .digest("hex"),
      ...data,
    };
    return sent as never;
  });
  const updateResource =
    prisma.emailDraftResource.updateMany.getMockImplementation()!;
  prisma.emailDraftResource.updateMany.mockImplementation(async (args) => {
    if (args.data.state === "CONSUMED")
      throw new Error("resource completion unavailable");
    return updateResource(args);
  });
  const execute = () =>
    executeDurableEmailSend({
      emailAccountId: "account",
      provider: "google",
      getEmailProvider: async () => provider,
      logger: createScopedLogger("draft-resource-test"),
      input: sendInput,
    });
  expect((await execute()).status).toBe("uncertain");
  expect(rows[0].state).toBe("UNCERTAIN");
  prisma.emailSendOperation.findUnique.mockResolvedValue(sent as never);
  prisma.emailDraftResource.updateMany.mockImplementation(updateResource);
  expect((await execute()).status).toBe("already_applied");
  expect(rows[0].state).toBe("CONSUMED");
  expect(providerSend).toHaveBeenCalledOnce();
});

it("merges an imported visible draft with a late create and keeps original discard ownership", async () => {
  let finish!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const creating = createDraftResource(input());
  await vi.waitFor(() => expect(provider.createDraft).toHaveBeenCalledOnce());
  await registerDraftResource({
    accountId: "account",
    resourceKey: "other-device",
    providerDraftId: "provider-draft",
  });
  await discardDraftResource(input());
  finish({ id: "provider-draft" });
  expect(await creating).toMatchObject({
    resourceKey: "other-device",
    owner: "DISCARD",
    state: "CONSUMED",
  });
  expect(await readDraftResource("account", "local-draft")).toMatchObject({
    resourceKey: "other-device",
    state: "CONSUMED",
  });
  expect(provider.deleteDraft).toHaveBeenCalledOnce();
  expect(provider.createDraft).toHaveBeenCalledOnce();
});

it("old keys resolve a late-create merge and preserve an already leased canonical send owner", async () => {
  let finish!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const creating = createDraftResource(input());
  await vi.waitFor(() => expect(provider.createDraft).toHaveBeenCalledOnce());
  await claimDraftResourceForSend({
    accountId: "account",
    resourceKey: "local-draft",
    sendOperationId: "original-send",
  });
  await registerDraftResource({
    accountId: "account",
    resourceKey: "other-device",
    providerDraftId: "provider-draft",
  });
  const claimed = await leaseDraftResourceForSend({
    accountId: "account",
    resourceKey: "other-device",
    sendOperationId: "canonical-send",
  });
  expect(claimed.status).toBe("ready");
  const leaseId = claimed.resource.leaseId;
  finish({ id: "provider-draft" });
  expect(await creating).toMatchObject({
    resourceKey: "other-device",
    owner: "SEND",
    sendOperationId: "canonical-send",
    leaseId,
  });
  expect(
    (
      await claimDraftResourceForSend({
        accountId: "account",
        resourceKey: "local-draft",
        sendOperationId: "original-send",
      })
    ).status,
  ).toBe("rejected");
  expect(provider.deleteDraft).not.toHaveBeenCalled();
});

it("a queued original send is adopted by the visible canonical draft and resolves through the old key", async () => {
  let finish!: (value: { id: string }) => void;
  vi.mocked(provider.createDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const creating = createDraftResource(input());
  await vi.waitFor(() => expect(provider.createDraft).toHaveBeenCalledOnce());
  await registerDraftResource({
    accountId: "account",
    resourceKey: "other-device",
    providerDraftId: "provider-draft",
  });
  await claimDraftResourceForSend({
    accountId: "account",
    resourceKey: "local-draft",
    sendOperationId: "original-send",
  });
  finish({ id: "provider-draft" });
  expect(await creating).toMatchObject({
    resourceKey: "other-device",
    owner: "SEND",
    sendOperationId: "original-send",
  });
  expect(
    await leaseDraftResourceForSend({
      accountId: "account",
      resourceKey: "local-draft",
      sendOperationId: "original-send",
    }),
  ).toMatchObject({
    status: "ready",
    resource: {
      resourceKey: "other-device",
      providerDraftId: "provider-draft",
    },
  });
});

const scheduledSendAt = new Date(Date.now() + 60_000).toISOString();
const scheduledInput = (operation: string) => ({
  clientMutationId: operation,
  threadId: null,
  messageIds: [],
  email: { ...content, draftResourceKey: "local-draft" },
  sendAt: scheduledSendAt,
  remindAt: null,
});
function admitTestSchedule(held: boolean, operation: string) {
  const input = scheduledInput(operation);
  return held
    ? holdEmailForUndo({
        emailAccountId: "account",
        input,
        sendAt: new Date(input.sendAt),
        logger: createScopedLogger("draft-resource-test"),
      })
    : scheduleEmail("account", input);
}
it.each([
  false,
  true,
])("atomic scheduled admission leaves a known noncommit editable and permits a new retry (held=%s)", async (held) => {
  await createDraftResource(input());
  prisma.$queryRaw.mockRejectedValueOnce(new Error("scheduled write refused"));
  await expect(admitTestSchedule(held, "failed-admission")).rejects.toThrow(
    "scheduled write refused",
  );
  expect(rows[0]).toMatchObject({ owner: "DRAFT", sendOperationId: null });
  expect(schedules).toHaveLength(0);
  await updateDraftResource(input());
  expect(provider.updateDraft).toHaveBeenCalledOnce();
  await admitTestSchedule(held, "new-operation");
  expect(rows[0]).toMatchObject({
    owner: "SEND",
    sendOperationId: "new-operation",
  });
  expect(schedules).toHaveLength(1);
});
it.each([
  false,
  true,
])("a lost atomic admission response recovers the committed row and protects its owner (held=%s)", async (held) => {
  await createDraftResource(input());
  const commit = prisma.$queryRaw.getMockImplementation()!;
  prisma.$queryRaw.mockImplementationOnce(async (...args) => {
    await commit(...args);
    throw new Error("response lost after commit");
  });
  const row = await admitTestSchedule(held, "committed-operation");
  expect(row.clientMutationId).toBe("committed-operation");
  expect(rows[0]).toMatchObject({
    owner: "SEND",
    sendOperationId: "committed-operation",
  });
  await expect(admitTestSchedule(held, "other-operation")).rejects.toThrow(
    "another pending operation",
  );
  expect(await admitTestSchedule(held, "committed-operation")).toEqual(row);
  expect(schedules).toHaveLength(1);
  await updateDraftResource(input());
  expect(provider.updateDraft).not.toHaveBeenCalled();
});
it.each([
  false,
  true,
])("an unknown admission commit is never released when reconciliation is unavailable (held=%s)", async (held) => {
  await createDraftResource(input());
  const commit = prisma.$queryRaw.getMockImplementation()!;
  const find = prisma.scheduledEmail.findUnique.getMockImplementation()!;
  prisma.$queryRaw.mockImplementationOnce(async (...args) => {
    await commit(...args);
    throw new Error("lost commit response");
  });
  prisma.scheduledEmail.findUnique
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error("database offline"));
  await expect(admitTestSchedule(held, "unknown-operation")).rejects.toThrow(
    "database offline",
  );
  expect(rows[0]).toMatchObject({
    owner: "SEND",
    sendOperationId: "unknown-operation",
  });
  prisma.scheduledEmail.findUnique.mockImplementation(find);
  expect(
    (await admitTestSchedule(held, "unknown-operation")).clientMutationId,
  ).toBe("unknown-operation");
  expect(schedules).toHaveLength(1);
});
