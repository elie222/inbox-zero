// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThread } from "./useThread";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

vi.mock("@/utils/email-cache/threads", () => ({
  readCachedThread: cache.read,
  writeCachedThread: cache.write,
}));

describe("useThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.write.mockResolvedValue(undefined);
  });

  it("returns an idle response when no thread is selected", async () => {
    const fetcher = vi.fn();

    const { result } = renderHook(() => useThread({ id: null }), {
      wrapper: createWrapper(fetcher),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isValidating).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.read).not.toHaveBeenCalled();
  });

  it("renders a persistent hit while the network revalidates", async () => {
    const network = Promise.withResolvers<unknown>();
    const fetcher = vi.fn(() => network.promise);
    cache.read.mockResolvedValue({
      data: { thread: { id: "thread-1", messages: [{ id: "cached" }] } },
    });

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(fetcher),
    });

    await waitFor(() => {
      expect(result.current.data?.thread.messages[0]?.id).toBe("cached");
      expect(result.current.isLoading).toBe(false);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never lets a late disk read overwrite fresher network data", async () => {
    const disk = Promise.withResolvers<unknown>();
    const network = Promise.withResolvers<unknown>();
    cache.read.mockReturnValue(disk.promise);

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(() => network.promise),
    });

    await act(async () => {
      network.resolve({
        thread: { id: "thread-1", messages: [{ id: "network" }] },
      });
    });
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("network"),
    );

    await act(async () => {
      disk.resolve({
        data: { thread: { id: "thread-1", messages: [{ id: "cached" }] } },
      });
    });

    expect(result.current.data?.thread.messages[0]?.id).toBe("network");
    expect(cache.write).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        threadId: "thread-1",
      }),
    );
  });

  it("does not expose or persist the previous thread while keys change", async () => {
    const secondNetwork = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn((key: [string, string]) =>
      key[0].includes("thread-1")
        ? Promise.resolve({
            thread: { id: "thread-1", messages: [{ id: "first" }] },
          })
        : secondNetwork.promise,
    );

    const { result, rerender } = renderHook(({ id }) => useThread({ id }), {
      initialProps: { id: "thread-1" },
      wrapper: createWrapper(fetcher, { keepPreviousData: true }),
    });
    await waitFor(() =>
      expect(result.current.data?.thread.id).toBe("thread-1"),
    );
    cache.write.mockClear();

    rerender({ id: "thread-2" });

    expect(result.current.data).toBeUndefined();
    expect(cache.write).not.toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-2",
        data: expect.objectContaining({
          thread: expect.objectContaining({ id: "thread-1" }),
        }),
      }),
    );
  });
});

function createWrapper(
  fetcher: (key: [string, string]) => unknown,
  options?: { keepPreviousData?: boolean },
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ fetcher, provider: () => new Map(), ...options }}>
        {children}
      </SWRConfig>
    );
  };
}
