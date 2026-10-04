import { env } from "./env.js";
import { log } from "./log.js";

export async function callWebhook(
  emailAccountId: string,
  newState?: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${env.MAIN_APP_URL}/api/fastmail/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.FASTMAIL_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify({ emailAccountId, newState }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return true;
      if (response.status === 401 || response.status === 403) break;
    } catch {
      /* The next attempt, then periodic reconciliation, recovers delivery. */
    }
    if (attempt < 3)
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  log("Notification could not be queued; scheduled reconciliation will retry", {
    emailAccountId,
  });
  return false;
}
