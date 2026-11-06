import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_PROVIDER_RATE_LIMIT_MESSAGE,
  UNEXPECTED_ACTION_ERROR_MESSAGE,
} from "@/utils/error";
import {
  BulkRunRateLimitGiveUpError,
  BulkRunRequestError,
  createBulkRunRetrier,
} from "./bulk-run-retry";

const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createBulkRunRetrier", () => {
  it("waits for Retry-After on a rate limit, then resumes and clears the wait", async () => {
    const onWaiting = vi.fn();
    const onRateLimited = vi.fn();
    const retrier = createBulkRunRetrier({ onWaiting, onRateLimited });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse(45))
      .mockResolvedValueOnce("page");

    const result = retrier.run(operation, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);

    expect(onRateLimited).toHaveBeenCalledTimes(1);
    expect(onWaiting).toHaveBeenLastCalledWith(new Date(Date.now() + 45_000));

    await vi.advanceTimersByTimeAsync(44_000);
    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe("page");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onWaiting).toHaveBeenLastCalledWith(null);
  });

  it("backs off exponentially when the provider gives no retry time", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const callTimes: number[] = [];
    const operation = vi.fn(async () => {
      callTimes.push(Date.now());
      if (callTimes.length <= 3)
        throw new Error(EMAIL_PROVIDER_RATE_LIMIT_MESSAGE);
      return "done";
    });

    const result = retrier.run(operation, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    await expect(result).resolves.toBe("done");
    const gaps = callTimes.slice(1).map((time, i) => time - callTimes[i]);
    expect(gaps[0]).toBeGreaterThan(0);
    expect(gaps[1]).toBeGreaterThan(gaps[0]);
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
  });

  it("makes concurrent requests wait on one shared cooldown without escalating it", async () => {
    const onWaiting = vi.fn();
    const retrier = createBulkRunRetrier({ onWaiting });
    const signal = new AbortController().signal;
    const first = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse(30))
      .mockResolvedValue("first");
    const second = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse(30))
      .mockResolvedValue("second");
    const third = vi.fn().mockResolvedValue("third");

    const results = Promise.all([
      retrier.run(first, signal),
      retrier.run(second, signal),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    const thirdResult = retrier.run(third, signal);
    await vi.advanceTimersByTimeAsync(0);

    // A request that starts during the cooldown waits instead of hitting the
    // provider again.
    expect(third).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    await expect(results).resolves.toEqual(["first", "second"]);
    await expect(thirdResult).resolves.toBe("third");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("gives up once waiting would exceed the bound without any progress", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const operation = vi.fn().mockRejectedValue(rateLimitResponse(4 * 60));

    const result = retrier.run(operation, new AbortController().signal);
    const assertion = expect(result).rejects.toBeInstanceOf(
      BulkRunRateLimitGiveUpError,
    );
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    await assertion;
    expect(operation.mock.calls.length).toBeGreaterThan(1);
  });

  it("gives up immediately when the provider asks to wait longer than the bound", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const operation = vi.fn().mockRejectedValue(rateLimitResponse(60 * 60));

    await expect(
      retrier.run(operation, new AbortController().signal),
    ).rejects.toBeInstanceOf(BulkRunRateLimitGiveUpError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up when an in-flight request extends the cooldown past the bound", async () => {
    const onWaiting = vi.fn();
    const retrier = createBulkRunRetrier({ onWaiting });
    const signal = new AbortController().signal;
    const first = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse(30))
      .mockResolvedValue("first");
    const second = vi.fn().mockRejectedValue(rateLimitResponse(60 * 60));

    const results = Promise.allSettled([
      retrier.run(first, signal),
      retrier.run(second, signal),
    ]);
    await vi.advanceTimersByTimeAsync(30_000);

    const [, secondResult] = await results;
    expect(secondResult).toMatchObject({
      status: "rejected",
      reason: expect.any(BulkRunRateLimitGiveUpError),
    });
  });

  it("shows a longer wait when an in-flight request extends the cooldown", async () => {
    const onWaiting = vi.fn();
    const retrier = createBulkRunRetrier({ onWaiting });
    const signal = new AbortController().signal;
    const first = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse(30))
      .mockResolvedValue("first");
    const second = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse(90))
      .mockResolvedValue("second");

    const results = Promise.all([
      retrier.run(first, signal),
      retrier.run(second, signal),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onWaiting).toHaveBeenLastCalledWith(new Date(Date.now() + 90_000));

    await vi.advanceTimersByTimeAsync(89_000);
    expect(first).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(results).resolves.toEqual(["first", "second"]);
  });

  it("stays paused when an in-flight request succeeds during the cooldown", async () => {
    const onWaiting = vi.fn();
    const retrier = createBulkRunRetrier({ onWaiting });
    const signal = new AbortController().signal;
    const inFlight = createDeferred<string>();
    const limited = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse(30))
      .mockResolvedValue("limited");

    const slowResult = retrier.run(() => inFlight.promise, signal);
    const limitedResult = retrier.run(limited, signal);
    await vi.advanceTimersByTimeAsync(0);
    inFlight.resolve("slow");
    await expect(slowResult).resolves.toBe("slow");

    expect(onWaiting).not.toHaveBeenCalledWith(null);

    await vi.advanceTimersByTimeAsync(30_000);
    await expect(limitedResult).resolves.toBe("limited");
    expect(onWaiting).toHaveBeenLastCalledWith(null);
  });

  it("resets the wait bound after a request succeeds", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const signal = new AbortController().signal;
    for (let i = 0; i < 3; i++) {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(rateLimitResponse(10 * 60))
        .mockResolvedValueOnce("ok");
      const result = retrier.run(operation, signal);
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      await expect(result).resolves.toBe("ok");
    }
  });

  it("retries transient failures a few times, then stops", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const operation = vi
      .fn()
      .mockRejectedValue(new Error(UNEXPECTED_ACTION_ERROR_MESSAGE));

    const result = retrier.run(operation, new AbortController().signal);
    const assertion = expect(result).rejects.toThrow(
      UNEXPECTED_ACTION_ERROR_MESSAGE,
    );
    await vi.advanceTimersByTimeAsync(MINUTE);
    await assertion;
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it("recovers from a transient server failure", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(
        new BulkRunRequestError({ status: 503, message: "Unavailable" }),
      )
      .mockResolvedValueOnce("ok");

    const result = retrier.run(operation, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(MINUTE);
    await expect(result).resolves.toBe("ok");
  });

  it("does not retry errors that will not go away", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const operation = vi
      .fn()
      .mockRejectedValue(new Error("AI automation is unavailable."));

    await expect(
      retrier.run(operation, new AbortController().signal),
    ).rejects.toThrow("AI automation is unavailable.");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("stops waiting as soon as the run is cancelled", async () => {
    const retrier = createBulkRunRetrier({ onWaiting: vi.fn() });
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(rateLimitResponse(5 * 60));

    const result = retrier.run(operation, controller.signal);
    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

function rateLimitResponse(retryAfterSeconds: number) {
  return new BulkRunRequestError({
    status: 429,
    message: EMAIL_PROVIDER_RATE_LIMIT_MESSAGE,
    retryAfterMs: retryAfterSeconds * 1000,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
