import { getThreadCacheVersion } from "./thread-invalidation";
import {
  createThreadDetailVariant,
  createThreadDetailRequestKey,
} from "./keys";

export type ThreadRequestOptions = {
  includeDrafts?: boolean;
  parseReplies?: boolean;
};

type ThreadRequest = ReturnType<typeof createThreadRequest>;

const inFlightRequests = new Map<string, Promise<unknown>>();

export function createThreadRequest({
  emailAccountId,
  threadId,
  options,
}: {
  emailAccountId: string;
  threadId: string;
  options?: ThreadRequestOptions;
}) {
  const variant = createThreadDetailVariant(options);

  return {
    emailAccountId,
    threadId,
    cacheIdentity: `${emailAccountId}:${threadId}:${variant}`,
    key: createThreadDetailRequestKey({ emailAccountId, threadId, options }),
    variant,
  };
}

export function isThreadRequestInFlight(
  request: Pick<ThreadRequest, "cacheIdentity">,
) {
  return inFlightRequests.has(request.cacheIdentity);
}

export function fetchThreadRequest<T>(
  request: ThreadRequest,
  fetcher: (version: string) => T | PromiseLike<T>,
) {
  const existing = inFlightRequests.get(request.cacheIdentity) as
    | Promise<T>
    | undefined;
  if (existing) return existing;

  const fetched = (async () => {
    while (true) {
      const version = getThreadCacheVersion(
        request.emailAccountId,
        request.threadId,
      );
      const data = await fetcher(version);
      if (
        version ===
        getThreadCacheVersion(request.emailAccountId, request.threadId)
      )
        return data;
    }
  })();
  const pending = fetched.finally(() => {
    if (inFlightRequests.get(request.cacheIdentity) === pending) {
      inFlightRequests.delete(request.cacheIdentity);
    }
  });
  inFlightRequests.set(request.cacheIdentity, pending);
  return pending;
}
