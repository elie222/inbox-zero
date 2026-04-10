import { after, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import type { Logger } from "@/utils/logger";
import { handleWebhookError } from "@/utils/webhook/error-handler";
import { runWithBackgroundLoggerFlush } from "@/utils/logger-flush";
import {
  cleanupWebhookAccountOnRateLimitSkip,
  getWebhookEmailAccount,
} from "@/utils/webhook/validate-webhook-account";
import { getEmailProviderRateLimitState } from "@/utils/email/rate-limit";
import { isGoogleProvider } from "@/utils/email/provider-types";

export const maxDuration = 300;

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError("google/webhook", async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const token = searchParams.get("token");

  let logger = request.logger;

  const verificationToken = env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;

  if (verificationToken == null) {
    logger.error("Google webhook verification token is not configured");
    return NextResponse.json(
      { message: "Google webhook is not configured" },
      { status: 503 },
    );
  }

  // Empty string intentionally disables query-param verification when
  // requests are authenticated upstream, such as via the OIDC gateway.
  if (verificationToken !== "" && token !== verificationToken) {
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

  const emailAccount = await getWebhookEmailAccount(
    { email: decodedData.emailAddress.toLowerCase() },
    logger,
  );

  if (emailAccount) {
    const activeRateLimit = await getEmailProviderRateLimitState({
      emailAccountId: emailAccount.id,
      logger,
    }).catch((error) => {
      logger.warn("Failed to read provider rate-limit state before enqueue", {
        error: error instanceof Error ? error.message : error,
      });
      return null;
    });

    if (isGoogleProvider(activeRateLimit?.provider)) {
      await cleanupWebhookAccountOnRateLimitSkip(emailAccount, logger).catch(
        (error) => {
          logger.warn(
            "Failed to cleanup webhook account during rate-limit skip",
            {
              error: error instanceof Error ? error.message : error,
              emailAccountId: emailAccount.id,
            },
          );
        },
      );
      logger.warn("Skipping webhook enqueue due to active Gmail rate limit", {
        emailAccountId: emailAccount.id,
        retryAt: activeRateLimit.retryAt.toISOString(),
        rateLimitSource: activeRateLimit.source,
      });
      return NextResponse.json({ ok: true });
    }
  }

  // Process history asynchronously using after() to avoid Pub/Sub acknowledgment timeout
  // This ensures we acknowledge the message quickly while still processing it fully
  after(() =>
    runWithBackgroundLoggerFlush({
      logger,
      task: () => processWebhookAsync(decodedData, logger, emailAccount),
      extra: { url: "/api/google/webhook" },
    }),
  );

  return NextResponse.json({ ok: true });
});

async function processWebhookAsync(
  decodedData: { emailAddress: string; historyId: number },
  logger: Logger,
  emailAccount?: Awaited<ReturnType<typeof getWebhookEmailAccount>> | null,
) {
  try {
    await processHistoryForUser(
      decodedData,
      { preloadedEmailAccount: emailAccount },
      logger,
    );
  } catch (error) {
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
