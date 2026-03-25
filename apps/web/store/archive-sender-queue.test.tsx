// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jotaiStore } from "@/store";

const mockExecuteAsync = vi.fn();

vi.mock("@/utils/actions/mail-bulk-action", () => ({
  bulkArchiveAction: vi.fn(),
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({
    executeAsync: mockExecuteAsync,
    isExecuting: false,
  }),
}));

vi.mock("./archive-queue", () => ({
  archiveEmails: vi.fn(),
}));

vi.mock("./sender-queue", () => ({
  createSenderQueue: () => ({
    addToQueue: vi.fn(),
  }),
}));

describe("archive sender queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps sender status scoped to the email account", async () => {
    mockExecuteAsync.mockResolvedValue({ data: { mode: "queued" } });

    const { useArchiveSenderQueueActions, useArchiveSenderStatus } =
      await import("./archive-sender-queue");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );
    const { result: firstAccountStatus } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );
    const { result: secondAccountStatus } = renderHook(
      () => useArchiveSenderStatus("account-2", "sender@example.com"),
      { wrapper },
    );

    await act(async () => {
      await actionResult.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    await waitFor(() => {
      expect(firstAccountStatus.current).toMatchObject({
        status: "completed",
        queued: true,
      });
    });
    expect(secondAccountStatus.current).toBeUndefined();
  });

  it("clears queued sender status after a short delay", async () => {
    vi.useFakeTimers();
    mockExecuteAsync.mockResolvedValue({ data: { mode: "queued" } });

    const { useArchiveSenderQueueActions, useArchiveSenderStatus } =
      await import("./archive-sender-queue");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-cleanup"),
      { wrapper },
    );
    const { result: statusResult } = renderHook(
      () => useArchiveSenderStatus("account-cleanup", "cleanup@example.com"),
      { wrapper },
    );

    await act(async () => {
      await actionResult.current.queueArchiveSenders({
        senders: ["cleanup@example.com"],
      });
    });

    expect(statusResult.current).toMatchObject({
      status: "completed",
      queued: true,
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(statusResult.current).toBeUndefined();
  });
});
