import { getListThreadKey, type ListThread } from "./types";
import { getThreadTimestamp } from "@/utils/threads/sort";

export function mergePartialSearchResults(
  remote: ListThread[],
  local: ListThread[],
  failedAccountIds: string[],
) {
  const failed = new Set(failedAccountIds);
  const seen = new Set(remote.map(getListThreadKey));
  const fallback = local.filter(
    (thread) =>
      "account" in thread &&
      failed.has(thread.account.id) &&
      !seen.has(getListThreadKey(thread)),
  );
  if (!fallback.length) return remote;
  return [...remote, ...fallback].sort(
    (a, b) => getThreadTimestamp(b) - getThreadTimestamp(a),
  );
}
