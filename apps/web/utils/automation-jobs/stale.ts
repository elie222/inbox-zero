const ONE_HOUR_MS = 60 * 60 * 1000;

export function isStaleAutomationJobRun({
  scheduledFor,
  now = new Date(),
  maxAgeMs = ONE_HOUR_MS,
}: {
  scheduledFor: Date;
  now?: Date;
  maxAgeMs?: number;
}) {
  return scheduledFor.getTime() < now.getTime() - maxAgeMs;
}
