import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import { createScopedLogger } from "@/utils/logger";

export const maxDuration = 120;

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const token = searchParams.get("token");

  let logger = createScopedLogger("google/webhook");

  if (
    env.GOOGLE_PUBSUB_VERIFICATION_TOKEN &&
    token !== env.GOOGLE_PUBSUB_VERIFICATION_TOKEN
  ) {
    logger.error("Invalid verification token", { token });
    return NextResponse.json(
      {
        message: "Invalid verification token",
      },
      { status: 403 },
    );
  }

  const body = await request.json();
  const decodedData = decodeHistoryId(body);

  logger = logger.with({
    email: decodedData.emailAddress,
    historyId: decodedData.historyId,
  });

  logger.info("Processing webhook");

  try {
    return await processHistoryForUser(decodedData, {}, logger);
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Invalid grant error", { error: error.message });
      // Returning 200 to avoid retry
      return NextResponse.json(
        { message: "Invalid grant error" },
        { status: 200 },
      );
    } else {
      throw error;
    }
  }
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
