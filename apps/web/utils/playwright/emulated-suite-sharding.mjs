export function shardPlaywrightTargets(targets, shard) {
  if (!shard) return targets;

  const match = /^(\d+)\/(\d+)$/.exec(shard);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    index < 1 ||
    count < 1 ||
    index > count
  ) {
    throw new Error("PLAYWRIGHT_SHARD must be a valid one-based index/count.");
  }

  // Keep each area's shared mailbox and test ordering on one isolated runner.
  return targets.filter((_, targetIndex) => targetIndex % count === index - 1);
}
