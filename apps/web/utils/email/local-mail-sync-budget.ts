import { randomUUID } from "node:crypto";
import { getProviderRateLimitDelayMs } from "@/utils/email/rate-limit";
import { redis } from "@/utils/redis";
import {
  getEmailProviderRateLimitStateFromRedis,
  isEmailProviderRateLimitRedisConfigured,
} from "@/utils/redis/email-provider-rate-limit";

// Conservative local-mail envelopes reserve most provider capacity for existing
// automation and interactive operations. They are not total application quotas.
// https://developers.google.com/workspace/gmail/api/reference/quota
// https://learn.microsoft.com/en-us/graph/throttling-limits#outlook-service-limits
const policies = {
  google: { account: 1200, app: 120_000, maximumCost: 500 },
  microsoft: { account: 60, app: 600, maximumCost: 1 },
};
export const gmailMailSyncCosts = {
  profile: 1,
  list: 5,
  history: 2,
  message: 20,
} as const;

type Input = {
  emailAccountId: string;
  provider: keyof typeof policies;
  priority: "backfill" | "current";
  cost: number;
};

export class LocalMailSyncPausedError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs = 60_000) {
    super("Local mail synchronization is paused");
    this.name = "LocalMailSyncPausedError";
    this.retryAfterMs = Math.max(1000, retryAfterMs);
  }
}

// Redis time makes admission independent of application-server clock skew.
// All buckets are checked before any debit, so a rejected request costs nothing.
const admitScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local cost = tonumber(ARGV[1])
local wait = 0
local buckets = {}
local recovery = 1
if redis.call('EXISTS', KEYS[8]) == 1 then recovery = 0.5 end
for i = 1, 4 do
  local capacity = tonumber(ARGV[i + 1])
  if capacity > 0 then
    local stored = redis.call('HMGET', KEYS[i], 'tokens', 'at')
    local tokens = tonumber(stored[1]) or capacity
    local at = tonumber(stored[2]) or now
    tokens = math.min(capacity, tokens + math.max(0, now - at) * capacity * recovery / 60000)
    buckets[i] = tokens
    if tokens < cost then wait = math.max(wait, math.ceil((cost - tokens) * 60000 / (capacity * recovery))) end
  end
end
local cooldown = tonumber(redis.call('GET', KEYS[7])) or 0
wait = math.max(wait, cooldown - now)
for i = 5, 6 do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now)
  local maximum = 1
  if i == 6 then maximum = 8 end
  if redis.call('ZCARD', KEYS[i]) >= maximum then wait = math.max(wait, 1000) end
end
if wait > 0 then return wait end
for i = 1, 4 do
  if buckets[i] then
    redis.call('HSET', KEYS[i], 'tokens', buckets[i] - cost, 'at', now)
    redis.call('PEXPIRE', KEYS[i], 120000)
  end
end
for i = 5, 6 do
  redis.call('ZADD', KEYS[i], now + 120000, ARGV[6])
  redis.call('PEXPIRE', KEYS[i], 180000)
end
return 0
`;
const releaseScript = `
for i = 1, 2 do redis.call('ZREM', KEYS[i], ARGV[1]) end
return 1
`;
const renewScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
for i = 1, 2 do
  if not redis.call('ZSCORE', KEYS[i], ARGV[1]) then return 0 end
end
for i = 1, 2 do
  redis.call('ZADD', KEYS[i], now + 120000, ARGV[1])
  redis.call('PEXPIRE', KEYS[i], 180000)
end
return 1
`;
const cooldownScript = `
redis.call('SET', KEYS[3], '1', 'PX', 300000)
local existing = redis.call('GET', KEYS[1])
if existing then
  local ok, decoded = pcall(cjson.decode, existing)
  if ok and decoded.retryAt and decoded.retryAt > ARGV[1] then return 0 end
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
local previous = tonumber(redis.call('GET', KEYS[2])) or 0
if tonumber(ARGV[4]) > previous then redis.call('SET', KEYS[2], ARGV[4], 'PX', ARGV[3]) end
return 1
`;

/** Each callback must honor its AbortSignal and perform only the reserved work.
 * No automatic retries: callers persist progress and schedule the next attempt.
 */
export async function withLocalMailSyncBudget<T>(
  input: Input,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const policy = policies[input.provider];
  if (
    !input.emailAccountId ||
    !Number.isInteger(input.cost) ||
    input.cost < 1 ||
    input.cost > policy.maximumCost
  )
    throw new Error("Invalid local mail sync reservation");
  const prefix = `local-mail-budget:${input.provider}`;
  const account = `${prefix}:${input.emailAccountId}`;
  const keys = [
    `${account}:total`,
    `${prefix}:total`,
    `${account}:backfill`,
    `${prefix}:backfill`,
    `${account}:active`,
    `${prefix}:active`,
    `${account}:cooldown`,
    `${account}:recovery`,
  ];
  const owner = randomUUID();
  try {
    if (!isEmailProviderRateLimitRedisConfigured())
      throw new LocalMailSyncPausedError();
    const cooldown = await getEmailProviderRateLimitStateFromRedis(input);
    if (cooldown)
      throw new LocalMailSyncPausedError(
        cooldown.retryAt.getTime() - Date.now(),
      );
    const background = input.priority === "backfill";
    const wait = await redis.eval<string[], number>(admitScript, keys, [
      String(input.cost),
      String(policy.account),
      String(policy.app),
      String(background ? policy.account / 2 : 0),
      String(background ? policy.app / 2 : 0),
      owner,
    ]);
    if (typeof wait !== "number" || !Number.isFinite(wait) || wait < 0)
      throw new LocalMailSyncPausedError();
    if (wait > 0) throw new LocalMailSyncPausedError(wait);
  } catch (error) {
    if (error instanceof LocalMailSyncPausedError) throw error;
    throw new LocalMailSyncPausedError();
  }
  const controller = new AbortController();
  const requestCount =
    input.provider === "google"
      ? Math.max(1, Math.ceil(input.cost / gmailMailSyncCosts.message))
      : 1;
  let pauseError: LocalMailSyncPausedError | undefined;
  const pause = () => {
    pauseError ??= new LocalMailSyncPausedError();
    controller.abort();
  };
  const timeout = setTimeout(pause, requestCount * 30_000);
  const activeKeys = keys.slice(4, 6);
  const renewal = setInterval(() => {
    redis
      .eval<string[], number>(renewScript, activeKeys, [owner])
      .then((renewed) => {
        if (renewed !== 1) pause();
      })
      .catch(pause);
  }, 20_000);
  try {
    const result = await operation(controller.signal);
    if (pauseError) throw pauseError;
    return result;
  } catch (error) {
    if (pauseError) throw pauseError;
    const delay = getProviderRateLimitDelayMs({
      error: normalizeThrottleHeaders(error),
      provider: input.provider,
      attemptNumber: 1,
    });
    if (delay !== null) {
      const now = Date.now();
      const retryAt = new Date(now + Math.max(1000, delay)).toISOString();
      try {
        await redis.eval(
          cooldownScript,
          [
            `email-provider-rate-limit:${input.emailAccountId}`,
            keys[6]!,
            keys[7]!,
          ],
          [
            retryAt,
            JSON.stringify({
              provider: input.provider,
              retryAt,
              source: "local-mail",
              detectedAt: new Date(now).toISOString(),
            }),
            String(Math.max(1000, delay) + 5000),
            String(now + Math.max(1000, delay)),
          ],
        );
      } catch {
        throw new LocalMailSyncPausedError(Math.max(60_000, delay));
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(renewal);
    // Failed release leaves a short-lived lease; it cannot admit excess work.
    await redis.eval(releaseScript, activeKeys, [owner]).catch(() => undefined);
  }
}

export function normalizeThrottleHeaders(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "headers" in error &&
    !("response" in error)
  )
    return { ...error, response: { headers: error.headers } };
  return error;
}
