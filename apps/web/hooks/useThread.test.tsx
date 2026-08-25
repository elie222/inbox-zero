// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig, unstable_serialize } from "swr";
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
  readCachedThreadDetail: cache.read,
  writeCachedThreadDetail: cache.write,
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

    network.resolve({
      thread: { id: "thread-1", messages: [{ id: "network" }] },
    });
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("network"),
    );
    await waitFor(() => expect(cache.write).toHaveBeenCalled());
  });

  it("falls back to the network when no cached detail exists", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn(() => network.promise);

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(fetcher),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    network.resolve({
      thread: { id: "thread-1", messages: [{ id: "network-only" }] },
    });

    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("network-only"),
    );
    expect(result.current.isLoading).toBe(false);
    expect(cache.write).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          thread: { id: "thread-1", messages: [{ id: "network-only" }] },
        },
        emailAccountId: "account-1",
        threadId: "thread-1",
      }),
    );
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

  it("does not expose or persist mismatched SWR data", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn(() => network.promise);
    const staleData = {
      thread: { id: "thread-1", messages: [{ id: "stale" }] },
    };
    const fallbackKey = unstable_serialize([
      "/api/threads/thread-2",
      "account-1",
    ]);

    const { result } = renderHook(() => useThread({ id: "thread-2" }), {
      wrapper: createWrapper(fetcher, {
        fallback: { [fallbackKey]: staleData },
      }),
    });

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(cache.write).not.toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-2",
        data: staleData,
      }),
    );
  });
});

function createWrapper(
  fetcher: (key: [string, string]) => unknown,
  options?: {
    keepPreviousData?: boolean;
    fallback?: Record<string, unknown>;
  },
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ fetcher, provider: () => new Map(), ...options }}>
        {children}
      </SWRConfig>
    );
  };
}
