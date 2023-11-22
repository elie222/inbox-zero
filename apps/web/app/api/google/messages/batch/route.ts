import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { MessageWithPayload, isDefined } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import { uniq } from "lodash";

const messagesBatchQuery = z.object({
  messageIds: z.array(z.string()).transform((arr) => uniq(arr)),
});
export type MessagesBatchQuery = z.infer<typeof messagesBatchQuery>;
export type MessagesBatchResponse = Awaited<
  ReturnType<typeof getMessagesBatch>
>;

// Uses Gmail batch API to get multiple messages in one request
// https://developers.google.com/gmail/api/guides/batch
async function getMessagesBatch(
  query: MessagesBatchQuery,
  accessToken: string,
) {
  let batchRequestBody = "";
  query.messageIds.forEach((id) => {
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

  const batchMessages: MessageWithPayload[] = parseResponse(textRes);
  const messages = batchMessages.map((message) => {
    return {
      ...message,
      parsedMessage: parseMessage(message),
    };
  });

  return { messages };
}

function parseResponse(batchResponse: string) {
  const parts = batchResponse.split("--batch_boundary");

  // Process each part
  const decodedParts = parts.map((part) => {
    // Skip empty parts
    if (!part.trim()) return;

    // Find where the JSON part of the response starts
    const jsonStartIndex = part.indexOf("{");
    if (jsonStartIndex === -1) return; // Skip if no JSON data found

    // Extract the JSON string
    const jsonResponseStart = part.substring(jsonStartIndex);
    const jsonEndIndex = jsonResponseStart.indexOf("--batch_");
    const jsonResponse = jsonResponseStart.substring(0, jsonEndIndex);

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

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const query = messagesBatchQuery.parse({
    messageIds: searchParams.getAll("messageIds"),
  });

  const accessToken = await getGmailAccessToken(session);

  if (!accessToken.token)
    return NextResponse.json({ error: "Invalid access token" });

  const result = await getMessagesBatch(query, accessToken.token);

  return NextResponse.json(result);
});
