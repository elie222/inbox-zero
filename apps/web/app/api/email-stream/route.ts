import type { NextRequest } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import { RedisSubscriber } from "@/utils/redis/subscriber";

const logger = createScopedLogger("email-stream");

// 5 minutes in milliseconds
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const pattern = `thread:${session.user.id}:*`;
  const redisSubscriber = RedisSubscriber.getInstance();

  redisSubscriber.psubscribe(pattern, (err) => {
    if (err) logger.error("Error subscribing to threads", { error: err });
  });

  // Set headers for SSE
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Content-Encoding": "none",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // For anyone using Nginx
  });

  logger.info("Creating SSE stream", { userId: session.user.id });

  const encoder = new TextEncoder();

  // Create a streaming response
  const redisStream = new ReadableStream({
    start(controller) {
      let inactivityTimer: NodeJS.Timeout;

      const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          logger.info("Stream closed due to inactivity", {
            userId: session.user.id,
          });
          controller.close();
          redisSubscriber.punsubscribe(pattern);
        }, INACTIVITY_TIMEOUT);
      };

      // Start initial inactivity timer
      resetInactivityTimer();

      redisSubscriber.on("pmessage", (_pattern, _channel, message) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        resetInactivityTimer(); // Reset timer on message
      });

      request.signal.addEventListener("abort", () => {
        logger.info("Cleaning up Redis subscription", {
          userId: session.user.id,
        });
        clearTimeout(inactivityTimer);
        redisSubscriber.punsubscribe(pattern);
      });
    },
  });

  return new Response(redisStream, { headers });
}
