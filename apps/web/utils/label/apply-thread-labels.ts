export const MAX_LABEL_THREADS_PER_ACTION = 25;

export async function applyThreadLabelsInBatches({
  threadIds,
  applyBatch,
}: {
  threadIds: string[];
  applyBatch: (threadIds: string[]) => Promise<{
    succeededThreadIds: string[];
    failedThreadIds: string[];
  }>;
}) {
  const targets = [...new Set(threadIds)];
  const succeededThreadIds: string[] = [];
  const failedThreadIds: string[] = [];
  for (
    let index = 0;
    index < targets.length;
    index += MAX_LABEL_THREADS_PER_ACTION
  ) {
    const batch = targets.slice(index, index + MAX_LABEL_THREADS_PER_ACTION);
    try {
      const result = await applyBatch(batch);
      succeededThreadIds.push(...result.succeededThreadIds);
      failedThreadIds.push(...result.failedThreadIds);
    } catch (error) {
      return {
        succeededThreadIds,
        failedThreadIds: [...failedThreadIds, ...targets.slice(index)],
        error,
      };
    }
  }
  return { succeededThreadIds, failedThreadIds, error: undefined };
}
