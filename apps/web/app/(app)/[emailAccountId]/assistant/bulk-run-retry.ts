import {
  EMAIL_PROVIDER_RATE_LIMIT_MESSAGE,
  UNEXPECTED_ACTION_ERROR_MESSAGE,
} from "@/utils/error";

// Waiting this long without a single successful request means the provider is
// not recovering soon, so the run stops and the user can start it again later.
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000;
const RATE_LIMIT_BASE_DELAY_MS = 5000;
const RATE_LIMIT_MAX_DELAY_MS = 2 * 60_000;
const MAX_TRANSIENT_RETRIES = 3;
const TRANSIENT_BASE_DELAY_MS = 2000;

export class BulkRunRequestError extends Error {
  status: number;
  retryAfterMs?: number;

  constructor({
    status,
    message,
    retryAfterMs,
  }: {
    status: number;
    message: string;
    retryAfterMs?: number;
  }) {
    super(message);
    this.name = "BulkRunRequestError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class BulkRunRateLimitGiveUpError extends Error {
  constructor() {
    super("Your email provider kept limiting requests.");
    this.name = "BulkRunRateLimitGiveUpError";
  }
}

// One retrier is shared by every request in a run, so a rate limit hit by one
// email pauses all of them instead of each hammering the provider on its own.
export function createBulkRunRetrier({
  onWaiting,
  onRateLimited,
}: {
  onWaiting: (resumeAt: Date | null) => void;
  onRateLimited?: () => void;
}) {
  let resumeAt = 0;
  let cooldownStartedAt = Number.NEGATIVE_INFINITY;
  let rateLimitStreak = 0;
  let waitingSince: number | null = null;

  function scheduleCooldown(error: unknown, requestStartedAt: number) {
    onRateLimited?.();
    const now = Date.now();
    waitingSince ??= now;
    const retryAfterMs =
      error instanceof BulkRunRequestError ? error.retryAfterMs : undefined;

    // Requests already in flight when the cooldown began are part of the same
    // burst: they wait it out without escalating the backoff.
    if (requestStartedAt <= cooldownStartedAt) {
      if (retryAfterMs) extendCooldown(now + retryAfterMs, waitingSince);
      return;
    }

    rateLimitStreak += 1;
    const delayMs = Math.max(
      retryAfterMs ?? 0,
      withJitter(
        Math.min(
          RATE_LIMIT_BASE_DELAY_MS * 2 ** (rateLimitStreak - 1),
          RATE_LIMIT_MAX_DELAY_MS,
        ),
      ),
    );
    cooldownStartedAt = now;
    extendCooldown(now + delayMs, waitingSince);
  }

  function extendCooldown(until: number, waitStartedAt: number) {
    if (until <= resumeAt) return;
    if (until - waitStartedAt > MAX_RATE_LIMIT_WAIT_MS) {
      throw new BulkRunRateLimitGiveUpError();
    }
    resumeAt = until;
    onWaiting(new Date(resumeAt));
  }

  function recordSuccess() {
    rateLimitStreak = 0;
    // A request that was already in flight can succeed while the others are
    // still waiting out the cooldown, so the run stays paused until it ends.
    if (waitingSince === null || Date.now() < resumeAt) return;
    waitingSince = null;
    onWaiting(null);
  }

  async function run<T>(
    operation: () => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    let transientFailures = 0;

    while (true) {
      while (Date.now() < resumeAt) {
        await sleep(resumeAt - Date.now(), signal);
      }
      throwIfAborted(signal);

      const startedAt = Date.now();
      try {
        const result = await operation();
        recordSuccess();
        return result;
      } catch (error) {
        if (signal.aborted) throw error;

        const kind = classifyError(error);
        if (kind === "rate-limit") {
          scheduleCooldown(error, startedAt);
          continue;
        }
        if (kind === "transient" && transientFailures < MAX_TRANSIENT_RETRIES) {
          transientFailures += 1;
          await sleep(
            withJitter(TRANSIENT_BASE_DELAY_MS * 2 ** (transientFailures - 1)),
            signal,
          );
          continue;
        }
        throw error;
      }
    }
  }

  return { run };
}

function classifyError(error: unknown): "rate-limit" | "transient" | "fatal" {
  if (error instanceof BulkRunRequestError) {
    if (error.status === 429) return "rate-limit";
    if (error.status >= 500) return "transient";
    return "fatal";
  }
  if (!(error instanceof Error)) return "fatal";
  if (error.message === EMAIL_PROVIDER_RATE_LIMIT_MESSAGE) return "rate-limit";
  if (
    error.message === UNEXPECTED_ACTION_ERROR_MESSAGE ||
    // fetch and server action calls reject with a TypeError on network failure
    error instanceof TypeError
  ) {
    return "transient";
  }
  return "fatal";
}

function withJitter(delayMs: number) {
  return Math.round(delayMs / 2 + (Math.random() * delayMs) / 2);
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(getAbortReason(signal));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timeout);
      reject(getAbortReason(signal));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw getAbortReason(signal);
}

function getAbortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}
