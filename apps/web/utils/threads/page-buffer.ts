import { createHash, randomUUID } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { createThreadListCacheKey } from "@/utils/email-cache/keys";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type {
  PageBuffer,
  PaginatedPage,
} from "@/utils/threads/merge-paginated-sources";

const logger = createScopedLogger("threads/page-buffer");
const BUFFER_TTL_SECONDS = 5 * 60;
const MAX_BUFFER_BYTES = 1024 * 1024;

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
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) return;

  const redis = new Redis({
    url: env.UPSTASH_REDIS_URL,
    token: env.UPSTASH_REDIS_TOKEN,
    retry: false,
    signal: () => AbortSignal.timeout(500),
  });
  const { query, ...identity } = scope;
  const scopeHash = createHash("sha256")
    .update(createThreadListCacheKey({ ...query, ...identity }))
    .digest("hex");
  const keyFor = (sourceId: string, id: string) => {
    const sourceHash = createHash("sha256").update(sourceId).digest("hex");
    return `thread-page:v1:${scopeHash}:${sourceHash}:${id}`;
  };

  return {
    async read({ sourceId, id }) {
      if (!/^[a-f0-9-]{36}$/.test(id)) return;
      try {
        const encoded = await redis.get<string>(keyFor(sourceId, id));
        if (typeof encoded !== "string" || encoded.length > MAX_BUFFER_BYTES)
          return;
        const page: unknown = deserialize(Buffer.from(encoded, "base64"));
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
        // Preserve dates and undefined fields in enriched account rows.
        const encoded = serialize(page).toString("base64");
        if (encoded.length > MAX_BUFFER_BYTES) return;
        const id = randomUUID();
        await redis.set(keyFor(sourceId, id), encoded, {
          ex: BUFFER_TTL_SECONDS,
        });
        return id;
      } catch {
        // Redis errors can contain the command payload, so don't log the error.
        logger.warn("Could not buffer thread page; pagination will refetch it");
      }
    },
  };
}
