// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScheduledEmailActions } from "./useScheduledEmailActions";

vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));

describe("useScheduledEmailActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a repeated action once while the first is out, but lets another action on the row run", async () => {
    let finishCancel: () => void = () => {};
    const fetch = vi.fn((url: string) =>
      url.endsWith("/reminder")
        ? Promise.resolve(Response.json({ success: true }))
        : new Promise<Response>((resolve) => {
            finishCancel = () => resolve(Response.json({ success: true }));
          }),
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useScheduledEmailActions("account-1"), {
      wrapper,
    });

    await act(async () => {
      const first = result.current.cancelSend("scheduled-1");
      const repeat = result.current.cancelSend("scheduled-1");
      await result.current.cancelReminder("scheduled-1");
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      finishCancel();
      await Promise.all([first, repeat]);
    });

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["/api/user/scheduled-emails/scheduled-1", "DELETE"],
      ["/api/user/scheduled-emails/scheduled-1/reminder", "DELETE"],
    ]);
  });

  // A change made just before a reload or a closed tab must still arrive.
  it("keeps its request alive past the page unloading", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ success: true })),
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useScheduledEmailActions("account-1"), {
      wrapper,
    });

    await act(() => result.current.retrySend("scheduled-1"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/user/scheduled-emails/scheduled-1/retry",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}
