import { createThreadDetailVariant } from "./keys";

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
  const searchParams = new URLSearchParams();
  if (options?.includeDrafts) searchParams.set("includeDrafts", "true");
  if (options?.parseReplies) searchParams.set("parseReplies", "true");
  const query = searchParams.toString();
  const url = `/api/threads/${encodeURIComponent(threadId)}${query ? `?${query}` : ""}`;
  const variant = createThreadDetailVariant(options);

  return {
    cacheIdentity: `${emailAccountId}:${threadId}:${variant}`,
    key: [url, emailAccountId] as [string, string],
    variant,
  };
}

export function fetchThreadRequest<T>(
  request: Pick<ThreadRequest, "cacheIdentity">,
  fetcher: () => T | PromiseLike<T>,
) {
  const existing = inFlightRequests.get(request.cacheIdentity) as
    | Promise<T>
    | undefined;
  if (existing) return existing;

  let fetched: Promise<T>;
  try {
    fetched = Promise.resolve(fetcher());
  } catch (error) {
    fetched = Promise.reject(error);
  }
  const pending = fetched.finally(() => {
    if (inFlightRequests.get(request.cacheIdentity) === pending) {
      inFlightRequests.delete(request.cacheIdentity);
    }
  });
  inFlightRequests.set(request.cacheIdentity, pending);
  return pending;
}
