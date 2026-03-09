export type BoundedConcurrencyResult<TItem, TResult> = {
  item: TItem;
  result: PromiseSettledResult<TResult>;
};

export async function runWithBoundedConcurrency<TItem, TResult>({
  items,
  concurrency,
  run,
  onBatchComplete,
}: {
  items: TItem[];
  concurrency: number;
  run: (item: TItem, index: number) => Promise<TResult>;
  onBatchComplete?: (
    results: BoundedConcurrencyResult<TItem, TResult>[],
  ) => Promise<void> | void;
}) {
  if (concurrency < 1) {
    throw new Error("concurrency must be at least 1");
  }

  const results: BoundedConcurrencyResult<TItem, TResult>[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((item, batchIndex) => run(item, i + batchIndex)),
    );

    const batchResults = settled.map((result, index) => {
      const item = batch[index];
      if (item === undefined) {
        throw new Error("Batch result index out of bounds");
      }

      return { item, result };
    });

    if (onBatchComplete) await onBatchComplete(batchResults);

    results.push(...batchResults);
  }

  return results;
}
