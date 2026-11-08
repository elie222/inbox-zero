// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelEmailReminderAction,
  cancelScheduledEmailAction,
} from "@/utils/actions/scheduled-email";
import { useScheduledEmailActions } from "./useScheduledEmailActions";

vi.mock("@/utils/actions/scheduled-email", () => ({
  cancelScheduledEmailAction: vi.fn(),
  cancelEmailReminderAction: vi.fn(),
  retryScheduledEmailAction: vi.fn(),
}));
vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));

describe("useScheduledEmailActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a repeated action once while the first is out, but lets another action on the row run", async () => {
    let finish: () => void = () => {};
    vi.mocked(cancelScheduledEmailAction).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      }) as ReturnType<typeof cancelScheduledEmailAction>,
    );
    vi.mocked(cancelEmailReminderAction).mockResolvedValue(
      undefined as Awaited<ReturnType<typeof cancelEmailReminderAction>>,
    );
    const { result } = renderHook(() => useScheduledEmailActions("account-1"), {
      wrapper,
    });

    await act(async () => {
      const first = result.current.cancelSend("scheduled-1");
      const repeat = result.current.cancelSend("scheduled-1");
      await result.current.cancelReminder("scheduled-1");
      await vi.waitFor(() =>
        expect(cancelScheduledEmailAction).toHaveBeenCalled(),
      );
      finish();
      await Promise.all([first, repeat]);
    });

    expect(cancelScheduledEmailAction).toHaveBeenCalledTimes(1);
    expect(cancelEmailReminderAction).toHaveBeenCalledTimes(1);
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}
