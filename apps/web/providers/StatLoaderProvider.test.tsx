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
        new Response('{"error":"server error"}', { status: 500 }),
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

describe("manual import under provider rate limits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-15T12:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const batchOptions = { loadBefore: true, showToast: true };

  it("waits at least a minute when Retry-After is shorter, then finishes the import", async () => {
    // A per-minute quota cannot recover in 1s, which is what the route can report.
    mocks.fetch
      .mockResolvedValueOnce(rateLimitedResponse("1"))
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    let batch!: Promise<void>;
    act(() => {
      batch = result.current.onLoadBatch(batchOptions);
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.rateLimitResumeAt).toEqual(
      new Date("2026-11-15T12:01:00Z"),
    );
    expect(result.current.isLoading).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(59_000));
    expect(mocks.fetch).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await batch;
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(51);
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(result.current.rateLimitResumeAt).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("honors a Retry-After longer than a minute", async () => {
    mocks.fetch
      .mockResolvedValueOnce(rateLimitedResponse("120"))
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    act(() => {
      result.current.onLoadBatch(batchOptions);
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.rateLimitResumeAt).toEqual(
      new Date("2026-11-15T12:02:00Z"),
    );
    await act(() => vi.advanceTimersByTimeAsync(119_000));
    expect(mocks.fetch).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.fetch.mock.calls.length).toBeGreaterThan(1);
  });

  it("gives up with an error after 15 minutes without a successful load", async () => {
    mocks.fetch.mockImplementation(() =>
      Promise.resolve(rateLimitedResponse("300")),
    );
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    let batch!: Promise<void>;
    act(() => {
      batch = result.current.onLoadBatch(batchOptions);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60_000);
      await batch;
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(result.current.rateLimitResumeAt).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("ends the pause as soon as the batch is canceled and sends no more requests", async () => {
    mocks.fetch
      .mockResolvedValueOnce(rateLimitedResponse())
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    let batch!: Promise<void>;
    act(() => {
      batch = result.current.onLoadBatch(batchOptions);
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.rateLimitResumeAt).not.toBeNull();

    await act(async () => {
      result.current.onCancelLoadBatch();
      await batch;
    });
    expect(result.current.rateLimitResumeAt).toBeNull();
    expect(result.current.isLoading).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("does not pause a batch that was canceled while its request was in flight", async () => {
    const pending = Promise.withResolvers<Response>();
    mocks.fetch.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useStatLoader, {
      wrapper: StatLoaderProvider,
    });
    let batch!: Promise<void>;
    act(() => {
      batch = result.current.onLoadBatch(batchOptions);
    });
    act(() => result.current.onCancelLoadBatch());

    await act(async () => {
      pending.resolve(rateLimitedResponse());
      await batch;
    });
    expect(result.current.rateLimitResumeAt).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

function rateLimitedResponse(retryAfterSeconds?: string) {
  return new Response('{"error":"rate limited","isKnownError":true}', {
    status: 429,
    headers: retryAfterSeconds ? { "Retry-After": retryAfterSeconds } : {},
  });
}
