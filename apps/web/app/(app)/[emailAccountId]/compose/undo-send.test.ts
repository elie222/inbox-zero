import { beforeEach, describe, expect, it, vi } from "vitest";
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
    const client = {
      cancelOperation: vi.fn().mockResolvedValue({ status: "cancelled" }),
    };
    const holdUntil = Date.now() + UNDO_SEND_DELAY_MS;
    beginUndoSend({
      client: client as never,
      operationId: "mutation",
      emailAccountId: "account",
      holdUntil,
      restoreComposer,
    });

    expect(notifications.toastUndo).toHaveBeenCalledWith({
      duration: expect.any(Number),
      id: "undo-send",
      message: "Email sent!",
      onUndo: expect.any(Function),
      shortcut: "z",
    });
    await expect(undoPendingSend()).resolves.toBe(true);
    expect(client.cancelOperation).toHaveBeenCalledWith({
      accountId: "account",
      operationId: "mutation",
    });
    expect(restoreComposer).toHaveBeenCalledOnce();
    expect(notifications.dismiss).toHaveBeenCalledWith("undo-send");
    await expect(undoPendingSend()).resolves.toBe(false);
  });

  it("does not restore when the send has already started", async () => {
    const restoreComposer = vi.fn();
    const client = {
      cancelOperation: vi.fn().mockResolvedValue({ status: "too_late" }),
    };
    beginUndoSend({
      client: client as never,
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
