// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { toastSuccess, toastUndo, undoLatestToast } from "./Toast";

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
    expect(sonner.dismiss).toHaveBeenLastCalledWith(toastId(1));
    await expect(undoLatestToast()).resolves.toBe(false);
  });

  // Sonner merges a toast into a same-id toast that is still animating out,
  // so a reused id would show the new undo toast already dismissed.
  it("shows each undo toast under a new id and dismisses the one it replaces", () => {
    toastUndo({ message: "Archived", onUndo: vi.fn() });
    toastUndo({ message: "Archived", onUndo: vi.fn() });

    expect(toastId(1)).not.toBe(toastId(0));
    expect(sonner.dismiss).toHaveBeenCalledWith(toastId(0));
  });

  it("dismisses the matching toast id", async () => {
    const onUndo = vi.fn();
    toastUndo({ id: "undo-send", message: "Email sent!", onUndo });
    await expect(undoLatestToast()).resolves.toBe(true);
    expect(sonner.dismiss).toHaveBeenCalledWith("undo-send");
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("stops handling keyboard undo once another toast replaces it", async () => {
    const onUndo = vi.fn();
    toastUndo({ id: "undo-send", message: "Email sent!", onUndo });
    toastSuccess({ id: "undo-send", description: "Email sent!" });

    await expect(undoLatestToast()).resolves.toBe(false);
    expect(onUndo).not.toHaveBeenCalled();
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

function toastId(call: number) {
  return (sonner.success.mock.calls[call]?.[1] as { id: string }).id;
}
