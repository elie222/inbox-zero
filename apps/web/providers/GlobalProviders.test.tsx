// @vitest-environment jsdom
import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUser } from "@/hooks/useUser";
import { GlobalProviders } from "./GlobalProviders";
import { SWRProvider } from "./SWRProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-test" }),
}));
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/welcome-upgrade" }));
vi.mock("@serwist/next/react", () => ({
  SerwistProvider: ({ children }: { children: ReactNode }) => children,
  useSerwist: () => ({ serwist: undefined }),
}));
vi.mock("nuqs/adapters/next/app", () => ({
  NuqsAdapter: ({ children }: { children: ReactNode }) => children,
}));

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
      <GlobalProviders>{children}</GlobalProviders>
    </SWRConfig>
  );
}

describe("global user-data fetching", () => {
  it("loads the signed-in user outside the mailbox providers", async () => {
    const user = { id: "user-test", premium: null, canManageBilling: true };
    const fetch = vi.fn().mockResolvedValue(Response.json(user));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(user));
    expect(fetch).toHaveBeenCalledWith("/api/user/me", expect.any(Object));
    expect(fetch.mock.calls[0][1].headers.has(EMAIL_ACCOUNT_HEADER)).toBe(
      false,
    );
  });

  it("treats an unauthenticated response as logged out", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Unauthorized" }, { status: 401 }),
        ),
    );
    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeNull());
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps service failures distinguishable from a signed-out session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Unavailable" }, { status: 503 }),
        ),
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
        <GlobalProviders>
          <SWRConfig value={{ provider: () => new Map(), fetcher }}>
            {children}
          </SWRConfig>
        </GlobalProviders>
      ),
    });
    await waitFor(() => expect(result.current.data?.id).toBe("user-test"));
    expect(fetcher).toHaveBeenCalledWith("/api/user/me");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not fetch just by mounting the global providers", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <GlobalProviders>
        <span />
      </GlobalProviders>,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the selected account header inside the app provider", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "user-test" }));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useUser(), {
      wrapper: ({ children }) => (
        <GlobalProviders>
          <SWRProvider>{children}</SWRProvider>
        </GlobalProviders>
      ),
    });
    await waitFor(() => expect(result.current.data?.id).toBe("user-test"));
    expect(fetch.mock.calls[0][1].headers.get(EMAIL_ACCOUNT_HEADER)).toBe(
      "account-test",
    );
  });

  it("does not fetch when disabled", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderHook(() => useUser(false), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
  });
});
