import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginUndoSend,
  getUndoSendHoldUntil,
  undoPendingSend,
  UNDO_SEND_DELAY_MS,
} from "./undo-send";

const restore = vi.hoisted(() => vi.fn());
const notifications = vi.hoisted(() => ({
  dismiss: vi.fn(),
  toastError: vi.fn(),
  toastUndo: vi.fn(),
}));

vi.mock("@/utils/email-cache/reply-drafts", () => ({
  restoreReplyFromOutbox: restore,
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
    await undoPendingSend();
    vi.clearAllMocks();
    restore.mockResolvedValue(undefined);
  });

  it("holds online sends and skips the delay when offline", () => {
    expect(getUndoSendHoldUntil(false, 1000)).toBeUndefined();
    expect(getUndoSendHoldUntil(true, 1000)).toBe(1000 + UNDO_SEND_DELAY_MS);
  });

  it("restores the composer when undo cancels a held send", async () => {
    const restoreComposer = vi.fn();
    beginUndoSend({
      mutationId: "mutation",
      emailAccountId: "account",
      identity: {
        emailAccountId: "account",
        threadId: "thread",
        messageId: "message",
      },
      restoreComposer,
    });

    expect(notifications.toastUndo).toHaveBeenCalledWith({
      duration: UNDO_SEND_DELAY_MS,
      message: "Email sent!",
      onUndo: expect.any(Function),
      shortcut: "z",
    });
    await expect(undoPendingSend()).resolves.toBe(true);
    expect(restore).toHaveBeenCalledWith("mutation", "account", {
      emailAccountId: "account",
      threadId: "thread",
      messageId: "message",
    });
    expect(restoreComposer).toHaveBeenCalledOnce();
    expect(notifications.dismiss).toHaveBeenCalledWith("undo");
    await expect(undoPendingSend()).resolves.toBe(false);
  });

  it("does not restore when the send has already started", async () => {
    const restoreComposer = vi.fn();
    restore.mockRejectedValue(new Error("Sending has already started"));
    beginUndoSend({
      mutationId: "mutation",
      emailAccountId: "account",
      identity: {
        emailAccountId: "account",
        threadId: "thread",
        messageId: "message",
      },
      restoreComposer,
    });

    await expect(undoPendingSend()).resolves.toBe(false);
    expect(restoreComposer).not.toHaveBeenCalled();
    expect(notifications.toastError).toHaveBeenCalledWith({
      description: "Couldn't undo send",
    });
  });
});
