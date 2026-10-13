import type {
  Observation,
  PendingCorrection,
} from "@/utils/mail-corrections/changes";

export async function filterNewSpamArrivals({
  emailAccountId,
  observations,
  previous,
  initialized,
  pending,
}: {
  emailAccountId: string;
  observations: Observation[];
  previous: Record<string, Observation>;
  initialized: boolean;
  pending: Record<string, Observation>;
}) {
  if (!initialized) return [];
  for (const item of observations)
    if (!previous[item.key] && item.targets.includes("@inbox"))
      pending[item.key] = item;
  const arrivals = Object.values(pending);
  const errors: Error[] = [];
  for (let offset = 0; offset < arrivals.length; offset += 20) {
    const batch = arrivals.slice(offset, offset + 20);
    try {
      await dispatch({ kind: "arrivals", emailAccountId, arrivals: batch });
      for (const item of batch) delete pending[item.key];
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return errors;
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
