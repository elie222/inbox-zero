// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatLoaderProvider, useStatLoader } from "./StatLoaderProvider";

const mocks = vi.hoisted(() => ({
  accountId: "account-1",
  fetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: mocks.accountId }),
}));
vi.mock("@/components/Toast", () => ({
  toastError: mocks.toastError,
  toastSuccess: mocks.toastSuccess,
}));
vi.mock("@/utils/actions/stats", () => ({
  loadEmailStatsAction: async () => undefined,
}));

beforeEach(() => {
  mocks.accountId = "account-1";
  mocks.fetch.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const options = { loadBefore: false, showToast: false };

describe("statistics request lifecycle", () => {
  it("uses the independent account-scoped HTTP route", async () => {
    mocks.fetch.mockResolvedValue(new Response("{}"));
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    await act(async () => result.current.onLoad(options));

    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("/api/user/stats/load");
    expect(init.method).toBe("POST");
    expect(init.headers.get("X-Email-Account-ID")).toBe("account-1");
    expect(JSON.parse(init.body)).toEqual({ loadBefore: false });
    expect(result.current.isLoading).toBe(false);
  });

  it("shares an identical in-flight request without queueing a second scan", async () => {
    const pending = Promise.withResolvers<Response>();
    mocks.fetch.mockReturnValue(pending.promise);
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = result.current.onLoad(options);
      second = result.current.onLoad(options);
    });

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      pending.resolve(new Response("{}"));
      await Promise.all([first, second]);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    "network",
    "http",
  ])("releases loading state after a %s failure and allows retry", async (failure) => {
    mocks.fetch
      .mockImplementationOnce(() =>
        failure === "network"
          ? Promise.reject(new Error("connection lost"))
          : Promise.resolve(
              new Response('{"error":"rate limited"}', { status: 429 }),
            ),
      )
      .mockResolvedValue(new Response("{}"));
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });

    await act(async () => {
      await expect(result.current.onLoad(options)).rejects.toThrow();
    });
    expect(result.current.isLoading).toBe(false);
    await act(async () => result.current.onLoad(options));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(false);
  });

  it("stops a manual import on failure, shows the error and permits retry", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        new Response('{"error":"rate limited"}', { status: 429 }),
      )
      .mockResolvedValue(new Response("{}"));
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });

    await act(async () => {
      await expect(
        result.current.onLoadBatch({ loadBefore: true, showToast: true }),
      ).resolves.toBeUndefined();
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    await act(async () => result.current.onLoad(options));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the new account loading when an old account request finishes", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    mocks.fetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    let oldLoad!: Promise<void>, newLoad!: Promise<void>;
    act(() => {
      oldLoad = result.current.onLoad(options);
    });
    mocks.accountId = "account-2";
    rerender();
    act(() => {
      newLoad = result.current.onLoad(options);
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.resolve(new Response("{}"));
      await oldLoad;
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      second.resolve(new Response("{}"));
      await newLoad;
    });
    expect(result.current.isLoading).toBe(false);
  });
});
