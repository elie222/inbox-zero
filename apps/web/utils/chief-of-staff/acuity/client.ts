// apps/web/utils/chief-of-staff/acuity/client.ts

const BASE_URL = "https://acuityscheduling.com/api/v1";
const MAX_RETRIES = 3;

export class AcuityApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`Acuity API error ${status} ${statusText}`);
    this.name = "AcuityApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

function getAuthHeader(): string {
  const userId = process.env.ACUITY_USER_ID;
  const apiKey = process.env.ACUITY_API_KEY;

  if (!userId) {
    throw new Error("Missing required environment variable: ACUITY_USER_ID");
  }
  if (!apiKey) {
    throw new Error("Missing required environment variable: ACUITY_API_KEY");
  }

  const encoded = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  return `Basic ${encoded}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acuityFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const authorization = getAuthHeader();

  const headers: Record<string, string> = {
    Authorization: authorization,
    Accept: "application/json",
  };

  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const url = `${BASE_URL}${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, init);

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const backoffMs = 1000 * 2 ** attempt; // 1s, 2s, 4s
      await delay(backoffMs);
      continue;
    }

    // Non-ok, non-429 (or exhausted retries on 429)
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    throw new AcuityApiError(
      response.status,
      response.statusText,
      responseBody,
    );
  }

  // Should never be reached, but satisfies TypeScript
  throw new AcuityApiError(429, "Too Many Requests", null);
}
