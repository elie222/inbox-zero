import { describe, expect, it, vi } from "vitest";
import {
  createHostRuntime,
  createMailEngine,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type {
  CancelResult,
  OperationExecutor,
} from "@inboxzero/mail-core/ports/operation-executor";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const SEND_KEY = { accountId: "acc-1", operationId: "send-1" };

describe("engine undo-window sends", () => {
  it("hands the send to the server at once and lets the server cancel it", async () => {
    const { engine, executor, store } = await sendHarness({
      cancel: { status: "cancelled" },
    });

    await engine.runUntil(Date.now() + 200);

    expect(executor.execute).toHaveBeenCalledOnce();
    const dispatched = executor.execute.mock.calls[0]?.[0].operation;
    expect(dispatched?.intent).toMatchObject({ kind: "send" });
    expect(
      dispatched?.intent.kind === "send" && dispatched.intent.sendAtMs,
    ).toBeGreaterThan(Date.now());
    expect((await engine.readOperation(SEND_KEY)).status).toBe("verifying");

    const result = await engine.cancelOperation(SEND_KEY);

    expect(result.status).toBe("cancelled");
    expect(executor.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: expect.objectContaining({ key: SEND_KEY }),
      }),
    );
    expect((await engine.readOperation(SEND_KEY)).status).toBe("cancelled");
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d1" },
          expectedRevision: 1,
          content: draftContent("<p>Edited after undo</p>"),
        })
      ).status,
    ).toBe("saved");
    await engine.close();
  });

  it("reports too late when the server has already started sending", async () => {
    const { engine } = await sendHarness({ cancel: { status: "too_late" } });
    await engine.runUntil(Date.now() + 200);

    const result = await engine.cancelOperation(SEND_KEY);

    expect(result.status).toBe("too_late");
    expect((await engine.readOperation(SEND_KEY)).status).toBe("verifying");
    await engine.close();
  });

  it("keeps the send held when the server cannot be reached", async () => {
    const { engine } = await sendHarness({ cancel: { status: "unavailable" } });
    await engine.runUntil(Date.now() + 200);

    const result = await engine.cancelOperation(SEND_KEY);

    expect(result.status).toBe("unavailable");
    expect((await engine.readOperation(SEND_KEY)).status).toBe("verifying");
    await engine.close();
  });

  it("cancels on the device without the server before the send leaves it", async () => {
    const { engine, executor } = await sendHarness({
      cancel: { status: "cancelled" },
    });

    const result = await engine.cancelOperation(SEND_KEY);

    expect(result.status).toBe("cancelled");
    expect(executor.cancel).not.toHaveBeenCalled();
    await engine.runUntil(Date.now() + 200);
    expect(executor.execute).not.toHaveBeenCalled();
    await engine.close();
  });
});

async function sendHarness({ cancel }: { cancel: CancelResult }) {
  const store = await createSqliteMailStore(createNodeSqliteDriver());
  await store.ensureAccount({
    accountId: "acc-1",
    provider: "google",
    generation: "g1",
  });
  const executor = {
    execute: vi.fn<OperationExecutor["execute"]>(async () => ({
      status: "accepted" as const,
      receiptId: "receipt-1",
      retryAfterMs: 30_000,
    })),
    inspect: vi.fn<OperationExecutor["inspect"]>(async () => ({
      status: "uncertain" as const,
      receiptId: null,
    })),
    cancel: vi.fn<NonNullable<OperationExecutor["cancel"]>>(async () => cancel),
  };
  const engine = createMailEngine({
    store,
    source: idleSource(),
    executor,
    runtime: createHostRuntime(),
  });
  const saved = await engine.saveDraft({
    key: { accountId: "acc-1", draftId: "d1" },
    expectedRevision: null,
    content: draftContent("<p>Thursday works.</p>"),
  });
  if (saved.status !== "saved") throw new Error("expected save");
  const admission = await engine.submitSend({
    commandId: SEND_KEY.operationId,
    conversationId: "thread-1",
    draft: { accountId: "acc-1", draftId: "d1" },
    draftRevision: saved.draftRevision,
    notBeforeMs: Date.now() + 30_000,
    replyTo: null,
  });
  expect(admission.status).toBe("queued");
  return {
    store,
    executor,
    engine: Object.assign(engine, {
      async readOperation(key: typeof SEND_KEY) {
        const { operation } = await store.readOperation(key);
        if (!operation) throw new Error("missing operation");
        return operation;
      },
    }),
  };
}

function draftContent(editableHtml: string) {
  return {
    to: ["ada@example.com"],
    cc: [],
    bcc: [],
    subject: "Re: Plans",
    editableHtml,
    quotedHtml: "",
    attachmentIds: [],
  };
}

function idleSource(): MailboxSource {
  const paused = {
    status: "paused" as const,
    retryAfterMs: 0,
    reason: "unavailable" as const,
  };
  return {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy: "account_history",
          supportedChanges: ["archive"],
          maxPageSize: 10,
          maxHydrationBatch: 10,
        },
      };
    },
    async discoverScopes() {
      return { status: "ok", value: { scopes: [], nextPage: null } };
    },
    async beginBootstrap() {
      return {
        status: "ok",
        value: { bootstrapId: "x", enumerationToken: "{}", catchUpFrom: null },
      };
    },
    async enumerate() {
      return paused;
    },
    async readChanges() {
      return paused;
    },
    async hydrate() {
      return paused;
    },
    async readConversationMembership() {
      return paused;
    },
    async search() {
      return { status: "unsupported" };
    },
    async readAttachment() {
      return paused;
    },
  };
}
