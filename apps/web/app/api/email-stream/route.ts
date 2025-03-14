import type { NextRequest } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import { RedisSubscriber } from "@/utils/redis/subscriber";

export const maxDuration = 300;

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
    async start(controller) {
      let inactivityTimer: NodeJS.Timeout;
      let isControllerClosed = false;

      const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          logger.info("Stream closed due to inactivity", {
            userId: session.user.id,
          });
          if (!isControllerClosed) {
            isControllerClosed = true;
            controller.close();
          }
          redisSubscriber.punsubscribe(pattern);
        }, INACTIVITY_TIMEOUT);
      };

      // Start initial inactivity timer
      resetInactivityTimer();

      redisSubscriber.on("pmessage", (_pattern, _channel, message) => {
        // Only enqueue if controller is not closed
        if (!isControllerClosed) {
          try {
            controller.enqueue(
              encoder.encode(`event: thread\ndata: ${message}\n\n`),
            );
            resetInactivityTimer(); // Reset timer on message
          } catch (error) {
            logger.error("Error enqueueing message", { error });
            // If we hit an error, mark controller as closed and clean up
            isControllerClosed = true;
            redisSubscriber.punsubscribe(pattern);
          }
        }
      });

      request.signal.addEventListener("abort", () => {
        logger.info("Cleaning up Redis subscription", {
          userId: session.user.id,
        });
        clearTimeout(inactivityTimer);
        if (!isControllerClosed) {
          isControllerClosed = true;
          controller.close();
        }
        redisSubscriber.punsubscribe(pattern);
      });
    },
  });

  return new Response(redisStream, { headers });
}
