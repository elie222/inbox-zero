// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUser } from "./useUser";

vi.mock("@/providers/EmailAccountProvider", () => ({ useAccount: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        fetcher: undefined,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}

describe("useUser outside the authenticated app providers", () => {
  it("loads the signed-in user without an inherited fetcher", async () => {
    const user = { id: "user-test", premium: null, canManageBilling: true };
    const fetch = vi.fn().mockResolvedValue(Response.json(user));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(user));
    expect(fetch).toHaveBeenCalledWith("/api/user/me");
  });

  it("treats an unauthenticated response as logged out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeNull());
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps service failures distinguishable from a signed-out session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.data).toBeNull();
  });

  it("deduplicates user requests from multiple consumers", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ id: "user-test" }));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => [useUser(), useUser()], { wrapper });
    await waitFor(() =>
      expect(
        result.current.every((user) => user.data?.id === "user-test"),
      ).toBe(true),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves the authenticated app fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: "user-test" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useUser(), {
      wrapper: ({ children }) => (
        <SWRConfig value={{ provider: () => new Map(), fetcher }}>
          {children}
        </SWRConfig>
      ),
    });
    await waitFor(() => expect(result.current.data?.id).toBe("user-test"));
    expect(fetcher).toHaveBeenCalledWith("/api/user/me");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not fetch when disabled", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderHook(() => useUser(false), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
  });
});
