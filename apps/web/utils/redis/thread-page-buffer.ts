import { createHash, randomUUID } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { encryptToken, decryptToken } from "@/utils/encryption";
import { createScopedLogger } from "@/utils/logger";
import { createThreadListCacheKey } from "@/utils/email-cache/keys";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type {
  PageBuffer,
  PaginatedPage,
} from "@/utils/threads/merge-paginated-sources";

const logger = createScopedLogger("redis/thread-page-buffer");
const BUFFER_TTL_SECONDS = 5 * 60;
const MAX_BUFFER_BYTES = 1024 * 1024;

// The deletion marker and write must be checked atomically so in-flight loads
// cannot recreate buffers while account deletion scans them.
const WRITE_BUFFER_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
redis.call("SET", KEYS[2], ARGV[1], "EX", ARGV[2])
return 1
`;

type PageBufferScope =
  | {
      kind: "labels";
      emailAccountId: string;
      messageFormat: "full" | "metadata";
      maxResults: number;
      query: ThreadsQuery;
    }
  | {
      kind: "combined";
      userId: string;
      query: {
        q: string | null | undefined;
        labelNames: string[];
        isUnread: boolean | undefined;
        limit: number;
      };
    };

export function createPageBuffer<TItem, TMeta = unknown>(
  scope: PageBufferScope,
): PageBuffer<TItem, TMeta> | undefined {
  const redis = createBufferRedis();
  if (!redis || !env.EMAIL_ENCRYPT_SECRET || !env.EMAIL_ENCRYPT_SALT) return;
  const createdAt = Date.now();
  const { query, ...identity } = scope;
  const scopeHash = createHash("sha256")
    .update(createThreadListCacheKey({ ...query, ...identity }))
    .digest("hex");
  const accountPrefixFor = (sourceId: string) =>
    getAccountPrefix(scope.kind === "labels" ? scope.emailAccountId : sourceId);
  const keyFor = (sourceId: string, id: string) => {
    const sourceHash = createHash("sha256").update(sourceId).digest("hex");
    return `${accountPrefixFor(sourceId)}:page:${scopeHash}:${sourceHash}:${id}`;
  };

  return {
    async read({ sourceId, id }) {
      if (!/^[a-f0-9-]{36}$/.test(id)) return;
      try {
        const key = keyFor(sourceId, id);
        const encoded = await redis.get<string>(key);
        if (typeof encoded !== "string" || encoded.length > MAX_BUFFER_BYTES)
          return;
        // Only accept encrypted values; decryptToken also supports legacy plaintext.
        if (!/^v\d+:[a-f0-9]+$/i.test(encoded)) return;
        const decoded = decryptToken(encoded);
        if (!decoded) return;
        const payload: unknown = deserialize(Buffer.from(decoded, "base64"));
        if (
          !payload ||
          typeof payload !== "object" ||
          !("key" in payload) ||
          payload.key !== key ||
          !("page" in payload)
        )
          return;
        const page = payload.page;
        if (
          !page ||
          typeof page !== "object" ||
          !("items" in page) ||
          !Array.isArray(page.items)
        )
          return;
        return page as PaginatedPage<TItem, TMeta>;
      } catch {
        logger.warn(
          "Could not read buffered thread page; fetching from provider",
        );
      }
    },
    async write({ sourceId, page }) {
      try {
        // Outlive neither the page TTL nor a deletion marker for this account.
        if (Date.now() - createdAt >= BUFFER_TTL_SECONDS * 1000) return;
        // Preserve dates and undefined fields in enriched account rows.
        const id = randomUUID();
        const key = keyFor(sourceId, id);
        const serialized = serialize({ key, page }).toString("base64");
        if (serialized.length > MAX_BUFFER_BYTES) return;
        const encoded = encryptToken(serialized);
        if (!encoded || encoded.length > MAX_BUFFER_BYTES) return;
        const stored = await redis.eval(
          WRITE_BUFFER_SCRIPT,
          [`${accountPrefixFor(sourceId)}:deleted`, key],
          [encoded, BUFFER_TTL_SECONDS],
        );
        return stored === 1 ? id : undefined;
      } catch {
        // Redis errors can contain the command payload, so don't log the error.
        logger.warn("Could not buffer thread page; pagination will refetch it");
      }
    },
  };
}

export async function withThreadPageBufferDeletion<T>(
  emailAccountIds: string[],
  deleteAccount: () => Promise<T>,
): Promise<T> {
  const redis = createBufferRedis();
  if (!redis) return deleteAccount();
  const markers: { key: string; token: string }[] = [];
  try {
    for (const emailAccountId of new Set(emailAccountIds)) {
      const prefix = getAccountPrefix(emailAccountId);
      const marker = `${prefix}:deleted`;
      const token = randomUUID();
      // Record ownership before awaiting: Redis may succeed but lose its response.
      markers.push({ key: marker, token });
      await redis.eval(
        `
        redis.call("SADD", KEYS[1], ARGV[1])
        redis.call("SREM", KEYS[1], "grace")
        redis.call("PERSIST", KEYS[1])
        return 1
      `,
        [marker],
        [token],
      );
      let cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, {
          match: `${prefix}:page:*`,
          count: 100,
        });
        cursor = Number(nextCursor);
        if (keys.length) await redis.del(...keys);
      } while (cursor !== 0);
    }
    return await deleteAccount();
  } finally {
    for (const { key, token } of markers) {
      try {
        // Keep blocking factories created during deletion until they age out.
        await redis.eval(
          `
          redis.call("SREM", KEYS[1], ARGV[1])
          local remaining = redis.call("SCARD", KEYS[1])
          if remaining == 0 then
            redis.call("SADD", KEYS[1], "grace")
            redis.call("EXPIRE", KEYS[1], ARGV[2])
          end
          return remaining
        `,
          [key],
          [token, BUFFER_TTL_SECONDS],
        );
      } catch {
        // A persistent marker safely disables buffering if cleanup is interrupted.
        logger.warn("Could not expire thread page deletion marker");
      }
    }
  }
}

function createBufferRedis() {
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) return;
  if (URL.parse(env.UPSTASH_REDIS_URL)?.protocol !== "https:") return;
  return new Redis({
    url: env.UPSTASH_REDIS_URL,
    token: env.UPSTASH_REDIS_TOKEN,
    retry: false,
    signal: () => AbortSignal.timeout(500),
  });
}

function getAccountPrefix(emailAccountId: string) {
  const accountHash = createHash("sha256").update(emailAccountId).digest("hex");
  return `thread-page:v2:${accountHash}`;
}
