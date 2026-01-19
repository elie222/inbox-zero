import { after, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import type { Logger } from "@/utils/logger";
import { handleWebhookError } from "@/utils/webhook/error-handler";
import { getWebhookEmailAccount } from "@/utils/webhook/validate-webhook-account";

export const maxDuration = 300;

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError("google/webhook", async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const token = searchParams.get("token");

  let logger = request.logger;

  const verificationToken = env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;

  if (!verificationToken) {
    logger.error("GOOGLE_PUBSUB_VERIFICATION_TOKEN not configured");
    return NextResponse.json(
      { message: "Webhook not configured" },
      { status: 500 },
    );
  }

  if (token !== verificationToken) {
    logger.error("Invalid verification token");
    return NextResponse.json(
      { message: "Invalid verification token" },
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
    // Look up email account to get emailAccountId for error tracking
    const emailAccount = await getWebhookEmailAccount(
      { email: decodedData.emailAddress.toLowerCase() },
      logger,
    ).catch((lookupError) => {
      logger.error("Error getting email account for error handling", {
        lookupError,
      });
      return null;
    });

    await handleWebhookError(error, {
      email: decodedData.emailAddress,
      emailAccountId: emailAccount?.id || "unknown",
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
