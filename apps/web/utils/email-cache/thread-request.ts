import { createThreadDetailVariant } from "./keys";

export type ThreadRequestOptions = {
  includeDrafts?: boolean;
  parseReplies?: boolean;
};

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
  const url = `/api/threads/${threadId}${query ? `?${query}` : ""}`;
  const variant = createThreadDetailVariant(options);

  return {
    cacheIdentity: `${emailAccountId}:${threadId}:${variant}`,
    key: [url, emailAccountId] as [string, string],
    variant,
  };
}
