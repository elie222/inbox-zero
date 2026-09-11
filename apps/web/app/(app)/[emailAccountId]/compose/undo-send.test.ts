import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginUndoSend,
  getUndoSendHoldUntil,
  undoPendingSend,
  UNDO_SEND_DELAY_MS,
} from "./undo-send";

const restore = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
const notifications = vi.hoisted(() => ({
  dismiss: vi.fn(),
  toastError: vi.fn(),
  toastUndo: vi.fn(),
}));

vi.mock("@/utils/email-cache/reply-drafts", () => ({
  restoreReplyFromOutbox: restore,
}));
vi.mock("@/utils/email-cache/mail-mutations", () => ({
  cancelPendingMailMutation: cancel,
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
    restore.mockResolvedValue(undefined);
    cancel.mockResolvedValue(false);
    await undoPendingSend();
    vi.clearAllMocks();
    restore.mockResolvedValue(undefined);
    cancel.mockResolvedValue(false);
  });

  it("holds online sends and skips the delay when offline", () => {
    expect(getUndoSendHoldUntil(false, 1000)).toBeUndefined();
    expect(getUndoSendHoldUntil(true, 1000)).toBe(1000 + UNDO_SEND_DELAY_MS);
  });

  it("restores the composer when undo cancels a held send", async () => {
    const restoreComposer = vi.fn();
    const holdUntil = Date.now() + UNDO_SEND_DELAY_MS;
    beginUndoSend({
      mutationId: "mutation",
      emailAccountId: "account",
      holdUntil,
      identity: {
        emailAccountId: "account",
        threadId: "thread",
        messageId: "message",
      },
      restoreComposer,
    });

    expect(notifications.toastUndo).toHaveBeenCalledWith({
      duration: expect.any(Number),
      id: "undo-send",
      message: "Email sent!",
      onUndo: expect.any(Function),
      shortcut: "z",
    });
    expect(
      notifications.toastUndo.mock.calls[0]?.[0].duration,
    ).toBeLessThanOrEqual(UNDO_SEND_DELAY_MS);
    await expect(undoPendingSend()).resolves.toBe(true);
    expect(restore).toHaveBeenCalledWith("mutation", "account", {
      emailAccountId: "account",
      threadId: "thread",
      messageId: "message",
    });
    expect(restoreComposer).toHaveBeenCalledOnce();
    expect(notifications.dismiss).toHaveBeenCalledWith("undo-send");
    await expect(undoPendingSend()).resolves.toBe(false);
  });

  it("does not restore when the send has already started", async () => {
    const restoreComposer = vi.fn();
    restore.mockRejectedValue(new Error("Sending has already started"));
    beginUndoSend({
      mutationId: "mutation",
      emailAccountId: "account",
      holdUntil: Date.now() + UNDO_SEND_DELAY_MS,
      identity: {
        emailAccountId: "account",
        threadId: "thread",
        messageId: "message",
      },
      restoreComposer,
    });

    await expect(undoPendingSend()).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledWith("mutation");
    expect(restoreComposer).not.toHaveBeenCalled();
    expect(notifications.toastError).toHaveBeenCalledWith({
      description: "Couldn't undo send",
    });
  });

  it("cancels a held send when a newer draft blocks restore", async () => {
    const restoreComposer = vi.fn();
    restore.mockRejectedValue(
      new Error("Finish or discard the current draft first."),
    );
    cancel.mockResolvedValue(true);
    beginUndoSend({
      mutationId: "mutation",
      emailAccountId: "account",
      holdUntil: Date.now() + UNDO_SEND_DELAY_MS,
      identity: {
        emailAccountId: "account",
        threadId: "thread",
        messageId: "message",
      },
      restoreComposer,
    });

    await expect(undoPendingSend()).resolves.toBe(true);
    expect(cancel).toHaveBeenCalledWith("mutation");
    expect(restoreComposer).not.toHaveBeenCalled();
    expect(notifications.toastError).not.toHaveBeenCalled();
  });
});
