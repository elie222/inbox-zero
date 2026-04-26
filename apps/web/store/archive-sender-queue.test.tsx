// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockArchiveEmails = vi.fn();
const mockFetchWithAccount = vi.fn();

vi.mock("./archive-queue", () => ({
  archiveEmails: (...args: Parameters<typeof mockArchiveEmails>) =>
    mockArchiveEmails(...args),
}));

vi.mock("@/utils/fetch", () => ({
  fetchWithAccount: (...args: Parameters<typeof mockFetchWithAccount>) =>
    mockFetchWithAccount(...args),
}));

describe("archive sender queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [] }),
    });
    mockArchiveEmails.mockResolvedValue(undefined);
  });

  it("keeps sender status scoped to the email account", async () => {
    const { jotaiStore } = await import("@/store");
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

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await actionResult.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(firstAccountStatus.current).toMatchObject({
      status: "completed",
      threadsTotal: 0,
    });
    expect(secondAccountStatus.current).toBeUndefined();
  });

  it("dedupes sender queue requests case-insensitively", async () => {
    const { jotaiStore } = await import("@/store");
    const { useArchiveSenderQueueActions } = await import(
      "./archive-sender-queue"
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await result.current.queueArchiveSenders({
        senders: ["Sender@example.com", " sender@example.com "],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(mockFetchWithAccount).toHaveBeenCalledTimes(1);
    expect(mockFetchWithAccount).toHaveBeenCalledWith({
      url: "/api/threads/basic?fromEmail=Sender%40example.com&labelId=INBOX",
      emailAccountId: "account-1",
    });
  });

  it("marks zero-thread senders completed without enqueuing archive work", async () => {
    const { jotaiStore } = await import("@/store");
    const {
      useArchiveQueueProgress,
      useArchiveSenderQueueActions,
      useArchiveSenderStatus,
    } = await import("./archive-sender-queue");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );
    const { result: statusResult } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );
    const { result: progressResult } = renderHook(
      () => useArchiveQueueProgress("account-1"),
      { wrapper },
    );

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await actionResult.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(statusResult.current).toMatchObject({
      status: "completed",
      threadsTotal: 0,
    });
    expect(progressResult.current).toEqual({
      totalItems: 1,
      completedItems: 1,
    });
    expect(mockArchiveEmails).not.toHaveBeenCalled();
  });

  it("tracks archive progress locally while thread work is queued", async () => {
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({
        threads: [{ id: "thread-1" }, { id: "thread-2" }],
      }),
    });
    mockArchiveEmails.mockImplementation(async ({ onSuccess }) => {
      onSuccess("thread-1");
    });

    const { jotaiStore } = await import("@/store");
    const {
      useArchiveQueueProgress,
      useArchiveSenderQueueActions,
      useArchiveSenderStatus,
    } = await import("./archive-sender-queue");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );
    const { result: statusResult } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );
    const { result: progressResult } = renderHook(
      () => useArchiveQueueProgress("account-1"),
      { wrapper },
    );

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await actionResult.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(mockArchiveEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        threadIds: ["thread-1", "thread-2"],
      }),
    );
    expect(statusResult.current).toMatchObject({
      status: "processing",
      threadIds: ["thread-2"],
      threadsTotal: 2,
    });
    expect(progressResult.current).toEqual({
      totalItems: 1,
      completedItems: 0,
    });
  });

  it("keeps the archived thread count on completed senders", async () => {
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({
        threads: [{ id: "thread-1" }, { id: "thread-2" }],
      }),
    });
    mockArchiveEmails.mockImplementation(async ({ onSuccess }) => {
      onSuccess("thread-1");
      onSuccess("thread-2");
    });

    const { jotaiStore } = await import("@/store");
    const { useArchiveSenderQueueActions, useArchiveSenderStatus } =
      await import("./archive-sender-queue");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );
    const { result: statusResult } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await actionResult.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(statusResult.current).toMatchObject({
      status: "completed",
      threadIds: [],
      threadsTotal: 2,
    });
  });

  it("returns zero when all requested senders are already queued", async () => {
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({
        threads: [{ id: "thread-1" }],
      }),
    });
    mockArchiveEmails.mockResolvedValue(undefined);

    const { jotaiStore } = await import("@/store");
    const { useArchiveSenderQueueActions } = await import(
      "./archive-sender-queue"
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );

    await act(async () => {
      await result.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    let queuedSenders = -1;
    await act(async () => {
      queuedSenders = await result.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    expect(queuedSenders).toBe(0);
  });

  it("keeps failed senders visible and allows retrying them", async () => {
    mockFetchWithAccount
      .mockRejectedValueOnce(new Error("Failed to fetch threads"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ threads: [] }),
      });

    const { jotaiStore } = await import("@/store");
    const {
      useArchiveQueueProgress,
      useArchiveSenderQueueActions,
      useArchiveSenderStatus,
    } = await import("./archive-sender-queue");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={jotaiStore}>{children}</Provider>
    );

    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );
    const { result: statusResult } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );
    const { result: progressResult } = renderHook(
      () => useArchiveQueueProgress("account-1"),
      { wrapper },
    );

    await act(async () => {
      await expect(
        actionResult.current.queueArchiveSenders({
          senders: ["sender@example.com"],
        }),
      ).rejects.toThrow("Failed to fetch threads");
    });

    expect(statusResult.current).toMatchObject({
      status: "failed",
      threadsTotal: 0,
    });
    expect(progressResult.current).toEqual({
      totalItems: 1,
      completedItems: 1,
    });

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await actionResult.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(statusResult.current).toMatchObject({
      status: "completed",
      threadsTotal: 0,
    });
  });
});
