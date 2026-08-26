// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailMutation } from "@/utils/email-cache/mail-mutations";
import { useRetainedMailMutationOverlay } from "./useMailMutationOverlay";

const outbox = vi.hoisted(() => ({
  active: [] as MailMutation[],
  activeError: false,
  listener: undefined as ((mutations?: MailMutation[]) => void) | undefined,
  stored: new Map<string, MailMutation>(),
}));

vi.mock("@/utils/email-cache/mail-mutations", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/utils/email-cache/mail-mutations")>();
  return {
    ...original,
    getActiveMailMutations: vi.fn(async (emailAccountId?: string) => {
      if (outbox.activeError) throw new Error("IndexedDB read failed");
      return outbox.active.filter(
        (mutation) =>
          !emailAccountId || mutation.emailAccountId === emailAccountId,
      );
    }),
    getMailMutations: vi.fn(async (ids: string[]) =>
      ids.flatMap((id) => {
        const mutation = outbox.stored.get(id);
        return mutation ? [mutation] : [];
      }),
    ),
    subscribeToMailMutations: vi.fn(
      (listener: (mutations?: MailMutation[]) => void) => {
        outbox.listener = listener;
        return vi.fn();
      },
    ),
  };
});

describe("useRetainedMailMutationOverlay", () => {
  beforeEach(() => {
    outbox.active = [];
    outbox.activeError = false;
    outbox.listener = undefined;
    outbox.stored = new Map();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the exact overlay until terminal mail is revalidated", async () => {
    const mutation = archiveMutation("account-1");
    const reconciliation = Promise.withResolvers<void>();
    const onReconcile = vi.fn(() => reconciliation.promise);
    outbox.active = [mutation];
    const { result } = renderHook(() =>
      useRetainedMailMutationOverlay({
        emailAccountId: "account-1",
        onReconcile,
      }),
    );

    await waitFor(() => expect(result.current.mutations).toEqual([mutation]));
    outbox.active = [];
    act(() => outbox.listener?.());

    await waitFor(() => expect(onReconcile).toHaveBeenCalledOnce());
    expect(result.current.mutations).toEqual([mutation]);

    reconciliation.resolve();
    await waitFor(() => expect(result.current.mutations).toEqual([]));
  });

  it("retains the overlay and retries after revalidation fails", async () => {
    const mutation = archiveMutation("account-1");
    const firstReconciliation = Promise.withResolvers<void>();
    const onReconcile = vi
      .fn()
      .mockReturnValueOnce(firstReconciliation.promise)
      .mockResolvedValueOnce(undefined);
    outbox.active = [mutation];
    const { result } = renderHook(() =>
      useRetainedMailMutationOverlay({
        emailAccountId: "account-1",
        onReconcile,
      }),
    );

    await waitFor(() => expect(result.current.mutations).toEqual([mutation]));
    outbox.active = [];
    act(() => outbox.listener?.());
    await waitFor(() => expect(onReconcile).toHaveBeenCalledOnce());

    outbox.stored.set(mutation.id, { ...mutation, status: "succeeded" });
    act(() => result.current.retainMutations([mutation]));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onReconcile).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    await act(async () => {
      firstReconciliation.reject(new Error("refresh failed"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.mutations).toEqual([mutation]);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(onReconcile).toHaveBeenCalledTimes(2);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.mutations).toEqual([]);
  });

  it("never carries a retained mutation into another account", async () => {
    outbox.active = [archiveMutation("account-1")];
    const { result, rerender } = renderHook(
      ({ emailAccountId }) =>
        useRetainedMailMutationOverlay({
          emailAccountId,
          onReconcile: vi.fn(),
        }),
      { initialProps: { emailAccountId: "account-1" } },
    );
    await waitFor(() => expect(result.current.mutations).toHaveLength(1));

    outbox.active = [];
    rerender({ emailAccountId: "account-2" });

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.mutations).toEqual([]);
  });

  it("revalidates an injected mutation that completed before active loading", async () => {
    const succeeded = {
      ...archiveMutation("account-1"),
      status: "succeeded" as const,
    };
    outbox.stored.set(succeeded.id, succeeded);
    const onReconcile = vi.fn();
    const { result } = renderHook(() =>
      useRetainedMailMutationOverlay({
        emailAccountId: "account-1",
        onReconcile,
      }),
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => result.current.retainMutations([succeeded]));

    await waitFor(() => expect(onReconcile).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.mutations).toEqual([]));
  });

  it("retains an enqueued mutation announced before active loading", async () => {
    const mutation = archiveMutation("account-1");
    outbox.stored.set(mutation.id, { ...mutation, status: "succeeded" });
    const reconciliation = Promise.withResolvers<void>();
    const onReconcile = vi.fn(() => reconciliation.promise);
    const { result } = renderHook(() =>
      useRetainedMailMutationOverlay({
        emailAccountId: "account-1",
        onReconcile,
      }),
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => outbox.listener?.([mutation]));

    await waitFor(() => expect(onReconcile).toHaveBeenCalledOnce());
    expect(result.current.mutations).toEqual([mutation]);

    reconciliation.resolve();
    await waitFor(() => expect(result.current.mutations).toEqual([]));
  });

  it("does not treat an IndexedDB read failure as terminal completion", async () => {
    const mutation = archiveMutation("account-1");
    outbox.active = [mutation];
    outbox.stored.set(mutation.id, mutation);
    const onReconcile = vi.fn();
    const { result } = renderHook(() =>
      useRetainedMailMutationOverlay({
        emailAccountId: "account-1",
        onReconcile,
      }),
    );
    await waitFor(() => expect(result.current.mutations).toEqual([mutation]));

    act(() => result.current.retainMutations([mutation]));
    outbox.activeError = true;
    act(() => outbox.listener?.());

    await waitFor(() => expect(result.current.isReadable).toBe(false));
    expect(result.current.mutations).toEqual([mutation]);
    expect(onReconcile).not.toHaveBeenCalled();
  });
});

function archiveMutation(emailAccountId: string): MailMutation {
  return {
    id: `mutation-${emailAccountId}`,
    batchId: "batch",
    emailAccountId,
    threadId: "thread",
    messageIds: ["message"],
    kind: "archive",
    status: "awaiting_sync",
    attempts: 1,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
