import { RedisSubscriber } from "@/utils/redis/subscriber";
import { withAuth } from "@/utils/middleware";
import { NextResponse } from "next/server";
import { getEmailAccount } from "@/utils/redis/account-validation";
import { assertCleanerApiEnabled } from "@/utils/cleaner-feature";

export const maxDuration = 300;

// 5 minutes in milliseconds
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

export const GET = withAuth("email-stream", async (request) => {
  assertCleanerApiEnabled();

  const { userId } = request.auth;

  const url = new URL(request.url);
  const emailAccountId = url.searchParams.get("emailAccountId");

  if (!emailAccountId) {
    request.logger.warn(
      "Bad Request: Email Account ID missing from query parameters.",
    );
    return NextResponse.json(
      { error: "Email account ID is required" },
      { status: 400 },
    );
  }

  const email = await getEmailAccount({ userId, emailAccountId });

  if (!email)
    return NextResponse.json({ error: "Invalid account ID" }, { status: 403 });

  request.logger.info("Processing GET request for email stream", {
    userId,
    emailAccountId,
  });

  const pattern = `thread:${emailAccountId}:*`;
  const redisSubscriber = RedisSubscriber.createInstance();

  redisSubscriber.psubscribe(pattern, (err) => {
    if (err)
      request.logger.error("Error subscribing to threads", { error: err });
  });

  // Set headers for SSE
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Content-Encoding": "none",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // For anyone using Nginx
  });

  request.logger.info("Creating SSE stream", { emailAccountId });

  const encoder = new TextEncoder();

  // Create a streaming response
  const redisStream = new ReadableStream({
    async start(controller) {
      let inactivityTimer: NodeJS.Timeout;
      let isControllerClosed = false;
      let isCleanedUp = false;

      const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          request.logger.info("Stream closed due to inactivity", {
            emailAccountId,
          });
          if (!isControllerClosed) {
            isControllerClosed = true;
            controller.close();
          }
          cleanup();
        }, INACTIVITY_TIMEOUT);
      };

      const handleMessage = (
        matchedPattern: string,
        _channel: string,
        message: string,
      ) => {
        if (matchedPattern !== pattern || isControllerClosed) return;

        try {
          controller.enqueue(
            encoder.encode(`event: thread\ndata: ${message}\n\n`),
          );
          resetInactivityTimer();
        } catch (error) {
          request.logger.error("Error enqueueing message", { error });
          isControllerClosed = true;
          cleanup();
        }
      };

      const cleanup = () => {
        if (isCleanedUp) return;

        isCleanedUp = true;
        clearTimeout(inactivityTimer);
        redisSubscriber.off("pmessage", handleMessage);
        redisSubscriber.disconnect();
      };

      // Start initial inactivity timer
      resetInactivityTimer();

      redisSubscriber.on("pmessage", handleMessage);

      request.signal.addEventListener("abort", () => {
        request.logger.info("Cleaning up Redis subscription", {
          emailAccountId,
        });
        if (!isControllerClosed) {
          isControllerClosed = true;
          controller.close();
        }
        cleanup();
      });
    },
  });

  return new Response(redisStream, { headers });
});
