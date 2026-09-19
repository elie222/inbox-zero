import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationState } from "@inboxzero/mail-core/operations";
import type { QueryHandle } from "@inboxzero/mail-core/queries";
import {
  beginUndoSend,
  getUndoSendHoldUntil,
  undoPendingSend,
  UNDO_SEND_DELAY_MS,
} from "./undo-send";

const notifications = vi.hoisted(() => ({
  dismiss: vi.fn(),
  toastError: vi.fn(),
  toastUndo: vi.fn(),
}));

vi.mock("@/components/Toast", () => ({
  toastError: notifications.toastError,
  toastUndo: notifications.toastUndo,
}));
vi.mock("sonner", () => ({
  toast: { dismiss: notifications.dismiss },
}));
vi.mock("@/lib/shortcuts/registry", () => ({
  getShortcutHint: () => "z",
}));

describe("undo send", () => {
  beforeEach(async () => {
    await undoPendingSend();
    vi.clearAllMocks();
  });

  it("holds online sends and skips the delay when offline", () => {
    expect(getUndoSendHoldUntil(false, 1000)).toBeUndefined();
    expect(getUndoSendHoldUntil(true, 1000)).toBe(1000 + UNDO_SEND_DELAY_MS);
  });

  it("restores the composer when undo cancels a held send", async () => {
    const restoreComposer = vi.fn();
    const { client, handle } = createClient();
    const holdUntil = Date.now() + UNDO_SEND_DELAY_MS;
    beginUndoSend({
      client,
      operationId: "mutation",
      emailAccountId: "account",
      holdUntil,
      restoreComposer,
    });

    const toast = notifications.toastUndo.mock.calls[0]?.[0];
    expect(toast).toEqual({
      duration: expect.any(Number),
      id: "undo-send",
      message: "Email sent!",
      onUndo: expect.any(Function),
      shortcut: "z",
    });
    expect(toast.duration).toBeGreaterThan(0);
    expect(toast.duration).toBeLessThanOrEqual(UNDO_SEND_DELAY_MS);
    await expect(undoPendingSend()).resolves.toBe(true);
    expect(client.cancelOperation).toHaveBeenCalledWith({
      accountId: "account",
      operationId: "mutation",
    });
    expect(restoreComposer).toHaveBeenCalledOnce();
    expect(notifications.dismiss).toHaveBeenCalledWith("undo-send");
    expect(handle.close).toHaveBeenCalled();
    await expect(undoPendingSend()).resolves.toBe(false);
  });

  it("does not offer undo after the hold has already expired", () => {
    beginUndoSend({
      client: createClient().client,
      operationId: "mutation",
      emailAccountId: "account",
      holdUntil: Date.now() - 1,
      restoreComposer: vi.fn(),
    });

    expect(notifications.toastUndo).not.toHaveBeenCalled();
  });

  it("dismisses undo when the send is no longer cancellable", async () => {
    const restoreComposer = vi.fn();
    const { client, handle } = createClient();
    beginUndoSend({
      client,
      operationId: "mutation",
      emailAccountId: "account",
      holdUntil: Date.now() + UNDO_SEND_DELAY_MS,
      restoreComposer,
    });

    handle.set("executing");

    expect(notifications.dismiss).toHaveBeenCalledWith("undo-send");
    expect(handle.close).toHaveBeenCalled();
    await expect(undoPendingSend()).resolves.toBe(false);
    expect(client.cancelOperation).not.toHaveBeenCalled();
    expect(restoreComposer).not.toHaveBeenCalled();
    expect(notifications.toastError).not.toHaveBeenCalled();
  });

  it("drops undo when the hold elapses even if the toast stays open", async () => {
    vi.useFakeTimers();
    const now = 1_000_000;
    vi.setSystemTime(now);
    const { client, handle } = createClient();
    beginUndoSend({
      client,
      operationId: "mutation",
      emailAccountId: "account",
      holdUntil: now + UNDO_SEND_DELAY_MS,
      restoreComposer: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(UNDO_SEND_DELAY_MS);

    expect(notifications.dismiss).toHaveBeenCalledWith("undo-send");
    expect(handle.close).toHaveBeenCalled();
    await expect(undoPendingSend()).resolves.toBe(false);
    expect(client.cancelOperation).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not restore when the send has already started", async () => {
    const restoreComposer = vi.fn();
    const { client } = createClient({ cancelStatus: "too_late" });
    beginUndoSend({
      client,
      operationId: "mutation",
      emailAccountId: "account",
      holdUntil: Date.now() + UNDO_SEND_DELAY_MS,
      restoreComposer,
    });

    await expect(undoPendingSend()).resolves.toBe(false);
    expect(restoreComposer).not.toHaveBeenCalled();
    expect(notifications.toastError).toHaveBeenCalledWith({
      description: "Couldn't undo send",
    });
  });
});

function createClient(options?: { cancelStatus?: "cancelled" | "too_late" }) {
  const handle = createHandle();
  const client = {
    cancelOperation: vi
      .fn()
      .mockResolvedValue({ status: options?.cancelStatus ?? "cancelled" }),
    observeOperation: vi.fn(() => handle),
  };
  return { client: client as never, handle };
}

function createHandle() {
  let listener: (() => void) | undefined;
  let data: OperationState | null = operationState("queued");
  const handle: QueryHandle<OperationState> & {
    set: (status: OperationState["status"]) => void;
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
    set(status) {
      data = operationState(status);
      listener?.();
    },
  };
  return handle;
}

function operationState(status: OperationState["status"]): OperationState {
  return {
    key: { accountId: "account", operationId: "mutation" },
    status,
    authority: "backend",
    attempts: 0,
    nextAttemptAtMs: null,
    error: null,
  };
}
