export function getQueueRetryBackoffSeconds({
  deliveryCount,
  maxBackoffSeconds = 300,
  baseBackoffSeconds = 5,
}: {
  deliveryCount: number;
  maxBackoffSeconds?: number;
  baseBackoffSeconds?: number;
}) {
  return Math.min(maxBackoffSeconds, 2 ** deliveryCount * baseBackoffSeconds);
}
