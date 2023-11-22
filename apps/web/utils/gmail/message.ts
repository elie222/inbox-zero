import { gmail_v1 } from "googleapis";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload, isDefined } from "@/utils/types";

export async function getMessage(
  messageId: string,
  gmail: gmail_v1.Gmail,
  format?: "full",
): Promise<MessageWithPayload> {
  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format,
  });

  return message.data as MessageWithPayload;
}

// Uses Gmail batch API to get multiple messages in one request
// https://developers.google.com/gmail/api/guides/batch
export async function getMessagesBatch(
  messageIds: string[],
  accessToken: string,
) {
  if (messageIds.length > 100) {
    throw new Error(
      `Request count exceeds the limit. Received: ${messageIds.length}, Limit: 100`,
    );
  }

  let batchRequestBody = "";
  messageIds.forEach((id) => {
    batchRequestBody += `--batch_boundary\nContent-Type: application/http\n\nGET /gmail/v1/users/me/messages/${id}\n\n`;
  });
  batchRequestBody += "--batch_boundary--";

  const res = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "multipart/mixed; boundary=batch_boundary",
    },
    body: batchRequestBody,
  });

  const textRes = await res.text();

  const batchMessages: MessageWithPayload[] = parseResponse(
    textRes,
    res.headers.get("Content-Type"),
  );
  const messages = batchMessages.map((message) => {
    return {
      ...message,
      parsedMessage: parseMessage(message),
    };
  });

  return messages;
}

function parseResponse(batchResponse: string, contentType: string | null) {
  // Extracting boundary from the Content-Type header
  const boundaryRegex = /boundary=(.*?)(;|$)/;
  const boundaryMatch = contentType?.match(boundaryRegex);
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  if (!boundary) {
    console.error("No boundary found in response", batchResponse, contentType);
    throw new Error("No boundary found in response");
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
      const messageData = JSON.parse(jsonResponse);

      return messageData;
    } catch (e) {
      console.error("Error parsing JSON:", e);
    }
  });

  return decodedParts.filter(isDefined);
}
