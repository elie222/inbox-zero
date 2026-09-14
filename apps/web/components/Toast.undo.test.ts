// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { toastUndo, undoLatestToast } from "./Toast";

const sonner = vi.hoisted(() => ({
  dismiss: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: sonner,
}));

describe("toast undo", () => {
  beforeEach(async () => {
    await undoLatestToast();
    vi.clearAllMocks();
  });

  it("runs the latest undo toast from the keyboard", async () => {
    const first = vi.fn();
    const second = vi.fn();
    toastUndo({ message: "Email sent!", onUndo: first });
    toastUndo({ message: "Archived", onUndo: second });

    await expect(undoLatestToast()).resolves.toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(sonner.dismiss).toHaveBeenCalledWith("undo");
    await expect(undoLatestToast()).resolves.toBe(false);
  });

  it("dismisses the matching toast id", async () => {
    const onUndo = vi.fn();
    toastUndo({ id: "undo-send", message: "Email sent!", onUndo });
    await expect(undoLatestToast()).resolves.toBe(true);
    expect(sonner.dismiss).toHaveBeenCalledWith("undo-send");
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("stops handling keyboard undo after the toast expires", async () => {
    const onUndo = vi.fn();
    toastUndo({ duration: 5000, message: "Email sent!", onUndo });
    const toastOptions = sonner.success.mock.calls[0]?.[1] as {
      onAutoClose?: () => void;
    };
    toastOptions.onAutoClose?.();

    await expect(undoLatestToast()).resolves.toBe(false);
    expect(onUndo).not.toHaveBeenCalled();
  });
});
