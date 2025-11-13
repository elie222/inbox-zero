import { env } from "./env";
import { createHmac } from "node:crypto";

export interface WorkerJobData {
  targetPath: string;
  payload: unknown;
  headers?: Record<string, string>;
}

function buildSignatureHeaders(bodyString: string): Record<string, string> {
  const timestamp = new Date().toISOString();
  const secret = env.WORKER_SIGNING_SECRET;
  if (!secret) {
    return {};
  }
  const payload = `${timestamp}.${bodyString}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return {
    "x-worker-signature": signature,
    "x-worker-timestamp": timestamp,
  };
}

export async function processJob(data: WorkerJobData): Promise<void> {
  const url = new URL(data.targetPath, env.WEB_BASE_URL).toString();
  const bodyString = JSON.stringify(data.payload ?? {});

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${env.CRON_SECRET}`,
    ...data.headers,
    ...buildSignatureHeaders(bodyString),
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: bodyString,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Callback failed: ${response.status} ${response.statusText} ${text}`,
    );
  }
}
