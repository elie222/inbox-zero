import { isDefined } from "@/utils/types";

const BATCH_LIMIT = 20; // Microsoft Graph batch limit is 20

/**
 * Batch fetch resources from Microsoft Graph.
 * @param ids Array of resource IDs.
 * @param endpoint Endpoint path, e.g. "/me/messages"
 * @param accessToken OAuth access token.
 */
export async function getGraphBatch(
  ids: string[],
  endpoint: string, // e.g. /me/messages
  accessToken: string,
) {
  if (!ids.length) return [];
  if (ids.length > BATCH_LIMIT) {
    throw new Error(
      `Request count exceeds the limit. Received: ${ids.length}, Limit: ${BATCH_LIMIT}`,
    );
  }

  // Build batch request body
  const requests = ids.map((id, idx) => ({
    id: String(idx + 1),
    method: "GET",
    url: `${endpoint}/${id}`,
  }));

  const batchRequestBody = JSON.stringify({ requests });

  const res = await fetch("https://graph.microsoft.com/v1.0/$batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: batchRequestBody,
  });

  if (!res.ok) {
    throw new Error(`Graph batch request failed: ${res.statusText}`);
  }

  const json = await res.json();

  // Extract responses and map by request id order
  const responses = (json.responses || []).map((resp: any) => {
    if (resp.status === 200) {
      return resp.body;
    }
    // Optionally handle errors per response
    return undefined;
  });

  return responses.filter(isDefined);
}
