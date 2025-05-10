import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import { logger } from "@/app/api/google/webhook/logger";

export const maxDuration = 120;

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const token = searchParams.get("token");
  if (
    env.GOOGLE_PUBSUB_VERIFICATION_TOKEN &&
    token !== env.GOOGLE_PUBSUB_VERIFICATION_TOKEN
  ) {
    logger.error("Invalid verification token");
    return NextResponse.json(
      {
        message: "Invalid verification token",
      },
      { status: 403 },
    );
  }

  const body = await request.json();
  const decodedData = decodeHistoryId(body);

  logger.info("Processing webhook", {
    emailAddress: decodedData.emailAddress,
    historyId: decodedData.historyId,
  });

  return await processHistoryForUser(decodedData);
});

function decodeHistoryId(body: { message?: { data?: string } }) {
  const data = body?.message?.data;

  if (!data) throw new Error("No data found");

  // data is base64url-encoded JSON
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const decodedData: { emailAddress: string; historyId: number | string } =
    JSON.parse(Buffer.from(base64, "base64").toString());

  // seem to get this in different formats? so unifying as number
  const historyId =
    typeof decodedData.historyId === "string"
      ? Number.parseInt(decodedData.historyId)
      : decodedData.historyId;

  return { emailAddress: decodedData.emailAddress, historyId };
}
