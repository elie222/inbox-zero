import { isDefined } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("gmail/batch");

const BATCH_LIMIT = 100;

// Uses Gmail batch API to get multiple responses in one request
// https://developers.google.com/gmail/api/guides/batch
export async function getBatch(
  ids: string[],
  endpoint: string, // e.g. /gmail/v1/users/me/messages
  accessToken: string,
) {
  if (!ids.length) return [];
  if (ids.length > BATCH_LIMIT) {
    throw new Error(
      `Request count exceeds the limit. Received: ${ids.length}, Limit: ${BATCH_LIMIT}`,
    );
  }

  let batchRequestBody = "";
  for (const id of ids) {
    batchRequestBody += `--batch_boundary\nContent-Type: application/http\n\nGET ${endpoint}/${id}\n\n`;
  }
  batchRequestBody += "--batch_boundary--";

  const res = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "multipart/mixed; boundary=batch_boundary",
      "Accept-Encoding": "gzip",
      "User-Agent": "Inbox-Zero (gzip)",
    },
    body: batchRequestBody,
  });

  const textRes = await res.text();

  const batch = parseBatchResponse(textRes, res.headers.get("Content-Type"));

  return batch;
}

function parseBatchResponse(batchResponse: string, contentType: string | null) {
  checkBatchResponseForError(batchResponse);

  // Extracting boundary from the Content-Type header
  const boundaryRegex = /boundary=(.*?)(;|$)/;
  const boundaryMatch = contentType?.match(boundaryRegex);
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  if (!boundary) {
    logger.error("No boundary found in response", { batchResponse });
    throw new Error("parseBatchResponse: No boundary found in response");
  }

  const parts = batchResponse.split(`--${boundary}`);

  // Process each part
  const decodedParts = parts.map((part) => {
    // Skip empty parts
    if (!part.trim()) return;

    // Find where the JSON part of the response starts
    const jsonStartIndex = part.indexOf("{");
    if (jsonStartIndex === -1) return; // Skip if no JSON data found

    // Extract the JSON string
    const jsonResponse = part.substring(jsonStartIndex);

    // Parse the JSON string
    try {
      const data = JSON.parse(jsonResponse);

      return data;
    } catch (error) {
      logger.error("Error parsing JSON", { error });
    }
  });

  return decodedParts.filter(isDefined);
}

function checkBatchResponseForError(batchResponse: string) {
  try {
    const jsonResponse = JSON.parse(batchResponse);

    if (jsonResponse.error) {
      throw new Error(
        "parseBatchResponse: Error in batch response",
        jsonResponse.error,
      );
    }
  } catch {
    // not json. skipping
  }
}
