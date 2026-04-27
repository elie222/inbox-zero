import { getInternalApiHeaders, getInternalApiUrl } from "@/utils/internal-api";
import type { Logger } from "@/utils/logger";

export async function forwardQueueMessageToInternalApi<T>({
  path,
  body,
  logger,
}: {
  path: string;
  body: T;
  logger: Logger;
}) {
  let response: Response;

  try {
    response = await fetch(`${getInternalApiUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getInternalApiHeaders(),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    logger.error(
      "Failed to reach internal API while forwarding queue message",
      {
        path,
        error,
      },
    );
    throw error;
  }

  if (response.ok) return;

  const responseBody = await getResponseBody(response);

  logger.error("Failed to forward Vercel queue callback to internal API", {
    path,
    status: response.status,
    responseBody,
  });

  throw new Error(
    `Failed to forward Vercel queue callback. Status: ${response.status}`,
  );
}

async function getResponseBody(response: Response) {
  try {
    return await response.text();
  } catch {
    return;
  }
}
