import type {
  Observation,
  PendingCorrection,
} from "@/utils/mail-corrections/changes";

export async function processNewMailArrivals({
  emailAccountId,
  observations,
  previous,
  initialized,
  pending,
  fileAfterReading = false,
}: {
  emailAccountId: string;
  observations: Observation[];
  previous: Record<string, Observation>;
  initialized: boolean;
  pending: Record<string, Observation>;
  fileAfterReading?: boolean;
}) {
  if (!initialized) return [];
  const newKeys = new Set<string>();
  for (const item of observations) {
    if (!item.targets.includes("@inbox")) {
      delete pending[item.key];
      continue;
    }
    if (!previous[item.key]) newKeys.add(item.key);
    if (
      newKeys.has(item.key) ||
      (fileAfterReading && ready(item) && !ready(previous[item.key])) ||
      pending[item.key]
    )
      pending[item.key] = item;
  }
  const arrivals = Object.values(pending);
  const errors: Error[] = [];
  for (const item of arrivals) {
    if (fileAfterReading && !newKeys.has(item.key) && !ready(item)) continue;
    try {
      // Acknowledging each email separately keeps slow AI work from replaying a whole batch.
      const result = await dispatch({
        kind: "arrivals",
        emailAccountId,
        arrivals: [item],
        fileAfterReading,
      });
      if (!result.deferred?.includes(item.key)) delete pending[item.key];
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return errors;
}

function ready(item: Observation | undefined) {
  return item?.isRead === true && item.isFlagged === false;
}

export async function learnObservedSpam(
  emailAccountId: string,
  change: PendingCorrection,
): Promise<"learned" | "automatic" | "ignored"> {
  const wasJunk = change.before.targets.includes("@junk");
  const isJunk = change.after.targets.includes("@junk");
  if (wasJunk && isJunk) return "ignored";
  const result = await dispatch({ kind: "correction", emailAccountId, change });
  if (!["learned", "automatic", "ignored"].includes(result.outcome))
    throw new Error("Invalid spam observer response");
  return result.outcome;
}

async function dispatch(body: unknown) {
  if (!process.env.NEXT_PUBLIC_BASE_URL || !process.env.INTERNAL_API_KEY)
    throw new Error("Spam observer endpoint is not configured");
  const response = await fetch(
    new URL("/api/spam-filter/observe", process.env.NEXT_PUBLIC_BASE_URL),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok)
    throw new Error(`Spam observer returned ${response.status}`);
  return response.json();
}
