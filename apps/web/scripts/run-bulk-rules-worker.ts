import { setTimeout as delay } from "node:timers/promises";

const controller = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => controller.abort());
async function main() {
  if (!process.env.INTERNAL_API_KEY || !process.env.NEXT_PUBLIC_BASE_URL)
    throw new Error("Worker configuration missing");
  const url = new URL(
    "/api/bulk-runs/execute",
    process.env.NEXT_PUBLIC_BASE_URL,
  );
  while (!controller.signal.aborted) {
    let worked = false;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "x-api-key": process.env.INTERNAL_API_KEY },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(360_000),
        ]),
      });
      if (!response.ok)
        throw new Error(`Worker request returned ${response.status}`);
      worked = (await response.json()).worked;
    } catch (error) {
      if (!controller.signal.aborted)
        console.error(
          "Bulk rules worker request failed",
          error instanceof Error ? error.message : "Unknown error",
        );
    }
    await delay(worked ? 200 : 3000, undefined, {
      signal: controller.signal,
    }).catch(() => {});
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
