// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopMailboxOpeningToast } from "./DesktopMailboxOpeningToast";

vi.mock("sonner", () => ({
  toast: { loading: vi.fn(), dismiss: vi.fn() },
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  window.inboxZeroDesktop = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DesktopMailboxOpeningToast", () => {
  it("shows only when opening the mailbox runs long, and clears once it opens", () => {
    const push = renderWithBridge();

    act(() => push(true));
    act(() => vi.advanceTimersByTime(1000));
    act(() => push(false));
    act(() => vi.advanceTimersByTime(5000));
    expect(toast.loading).not.toHaveBeenCalled();

    act(() => push(true));
    act(() => vi.advanceTimersByTime(1500));
    expect(toast.loading).toHaveBeenCalledWith(
      "Updating your mailbox…",
      expect.objectContaining({ id: "desktop-mailbox-opening" }),
    );

    vi.mocked(toast.dismiss).mockClear();
    act(() => push(false));
    expect(toast.dismiss).toHaveBeenCalledWith("desktop-mailbox-opening");
  });

  it("stops listening and drops a pending toast on unmount", () => {
    const push = renderWithBridge();
    act(() => push(true));
    cleanup();
    act(() => push(true));
    act(() => vi.advanceTimersByTime(5000));
    expect(toast.loading).not.toHaveBeenCalled();
  });

  it("renders nothing outside the desktop app", () => {
    render(<DesktopMailboxOpeningToast />);
    act(() => vi.advanceTimersByTime(5000));
    expect(toast.loading).not.toHaveBeenCalled();
  });
});

function renderWithBridge() {
  let push: (opening: boolean) => void = () => {};
  window.inboxZeroDesktop = {
    startAuth: async () => {},
    onMailEngineOpening: (listener) => {
      push = listener;
      return () => {
        push = () => {};
      };
    },
  };
  render(<DesktopMailboxOpeningToast />);
  return (opening: boolean) => push(opening);
}
