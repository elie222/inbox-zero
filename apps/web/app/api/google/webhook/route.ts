import { after, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import type { Logger } from "@/utils/logger";
import { handleWebhookError } from "@/utils/webhook/error-handler";

export const maxDuration = 300;

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError("google/webhook", async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const token = searchParams.get("token");

  let logger = request.logger;

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

  logger.info("Received webhook - acknowledging immediately");

  // Process history asynchronously using after() to avoid Pub/Sub acknowledgment timeout
  // This ensures we acknowledge the message quickly while still processing it fully
  after(() => processWebhookAsync(decodedData, logger));

  return NextResponse.json({ ok: true });
});

async function processWebhookAsync(
  decodedData: { emailAddress: string; historyId: number },
  logger: Logger,
) {
  try {
    await processHistoryForUser(decodedData, {}, logger);
  } catch (error) {
    await handleWebhookError(error, {
      email: decodedData.emailAddress,
      emailAccountId: "unknown", // TODO: add emailAccountId
      url: "/api/google/webhook",
      logger,
    });
  }
}

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
