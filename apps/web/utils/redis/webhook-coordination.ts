import { randomUUID } from "node:crypto";
import { redis } from "@/utils/redis";

const LEASE_TTL_SECONDS = 60 * 5;
const PENDING_HISTORY_TTL_SECONDS = 60 * 60;

const RELEASE_IF_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

const SET_MAX_HISTORY_ID_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current == false or tonumber(ARGV[1]) > tonumber(current) then
  redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
  return 1
end
return 0
`;

function getLeaseKey(emailAccountId: string) {
  return `webhook:account-lease:${emailAccountId}`;
}

function getPendingHistoryKey(emailAccountId: string) {
  return `webhook:pending-history:${emailAccountId}`;
}

export async function acquireWebhookAccountLease(
  emailAccountId: string,
): Promise<string | null> {
  const token = randomUUID();
  const result = await redis.set(getLeaseKey(emailAccountId), token, {
    ex: LEASE_TTL_SECONDS,
    nx: true,
  });

  return result === "OK" ? token : null;
}

export async function releaseWebhookAccountLease(
  emailAccountId: string,
  token: string,
): Promise<boolean> {
  const result = await redis.eval<string[], number>(
    RELEASE_IF_OWNED_SCRIPT,
    [getLeaseKey(emailAccountId)],
    [token],
  );

  return result === 1;
}

export async function setPendingWebhookHistoryId(
  emailAccountId: string,
  historyId: number,
): Promise<boolean> {
  const result = await redis.eval<string[], number>(
    SET_MAX_HISTORY_ID_SCRIPT,
    [getPendingHistoryKey(emailAccountId)],
    [historyId.toString(), PENDING_HISTORY_TTL_SECONDS.toString()],
  );

  return result === 1;
}

export async function getPendingWebhookHistoryId(
  emailAccountId: string,
): Promise<number | null> {
  const value = await redis.get<string>(getPendingHistoryKey(emailAccountId));
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function clearPendingWebhookHistoryId(
  emailAccountId: string,
): Promise<void> {
  await redis.del(getPendingHistoryKey(emailAccountId));
}
