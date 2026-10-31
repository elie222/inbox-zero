// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { GlobalProviders } from "./GlobalProviders";
import { SWRProvider } from "./SWRProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { registerOpenComposer } from "@/utils/safe-reload";
import { SKIP_WAITING } from "@/utils/offline/mail-cache";

const serwistState = vi.hoisted(() => ({
  pathname: "/welcome-upgrade",
  serwist: undefined as { register: () => Promise<unknown> } | undefined,
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-test" }),
}));
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => serwistState.pathname,
}));
vi.mock("@serwist/next/react", () => ({
  SerwistProvider: ({ children }: { children: ReactNode }) => children,
  useSerwist: () => ({ serwist: serwistState.serwist }),
}));
vi.mock("nuqs/adapters/next/app", () => ({
  NuqsAdapter: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(toast.info).mockClear();
  serwistState.serwist = undefined;
  serwistState.pathname = "/welcome-upgrade";
  vi.useRealTimers();
  sessionStorage.clear();
});

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

describe("service worker updates", () => {
  it.each([
    "hidden",
    "route",
  ])("activates a waiting worker only at a safe %s moment", async (moment) => {
    const { registration, serviceWorker, waiting, reload } =
      setUpDesktopUpdate();
    const view = render(<GlobalProviders>mail</GlobalProviders>);
    await waitFor(() => expect(registration.update).toHaveBeenCalled());
    vi.useFakeTimers();
    expect(toast.info).not.toHaveBeenCalled();
    expect(waiting.postMessage).not.toHaveBeenCalled();
    const close = registerOpenComposer();
    const nextMoment = () => {
      if (moment === "hidden") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      } else {
        serwistState.pathname += "/next";
        view.rerender(<GlobalProviders>mail</GlobalProviders>);
      }
    };
    act(nextMoment);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    close();
    act(nextMoment);
    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: SKIP_WAITING,
    });
    // Editing can begin while the worker is activating.
    const stopEditing = registerOpenComposer();
    act(() => serviceWorker.dispatchEvent(new Event("controllerchange")));
    act(() => vi.advanceTimersByTime(5000));
    expect(reload).not.toHaveBeenCalled();
    stopEditing();
    act(nextMoment);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves a waiting worker alone in a browser tab", async () => {
    const { waiting } = setUpDesktopUpdate({ desktop: false });
    const register = serwistState.serwist?.register;
    const view = render(<GlobalProviders>mail</GlobalProviders>);
    await waitFor(() => expect(register).toHaveBeenCalled());
    serwistState.pathname += "/next";
    view.rerender(<GlobalProviders>mail</GlobalProviders>);
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it("defers controller changes from another window while composing", async () => {
    const { registration, serviceWorker, reload } = setUpDesktopUpdate();
    const view = render(<GlobalProviders>mail</GlobalProviders>);
    await waitFor(() => expect(registration.update).toHaveBeenCalled());
    vi.useFakeTimers();
    const close = registerOpenComposer();
    act(() => vi.advanceTimersByTime(3000));
    act(() => serviceWorker.dispatchEvent(new Event("controllerchange")));
    expect(reload).not.toHaveBeenCalled();
    close();
    serwistState.pathname = "/account/automation";
    view.rerender(<GlobalProviders>mail</GlobalProviders>);
    expect(reload).toHaveBeenCalledTimes(1);
  });
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

function setUpDesktopUpdate({ desktop = true } = {}) {
  const waiting = { postMessage: vi.fn() };
  const registration = Object.assign(new EventTarget(), {
    waiting,
    update: vi.fn().mockResolvedValue(undefined),
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: { postMessage: vi.fn() },
    getRegistration: vi.fn().mockResolvedValue(registration),
  });
  const reload = vi.fn();

  if (desktop) vi.stubGlobal("inboxZeroDesktop", { startAuth: vi.fn() });
  vi.stubGlobal("navigator", { onLine: true, serviceWorker });
  vi.stubGlobal("location", { ...window.location, reload });
  serwistState.serwist = {
    register: vi.fn().mockResolvedValue(registration),
  };

  return { registration, serviceWorker, waiting, reload };
}
