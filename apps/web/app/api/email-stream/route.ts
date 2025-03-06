import type { NextRequest } from "next/server";
// import {
//   ACTIONS,
//   COMMON_LABELS,
//   SENDERS,
//   SUBJECTS,
// } from "@/app/(app)/clean/email-constants";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import { RedisSubscriber } from "@/utils/redis/subscriber";

const logger = createScopedLogger("email-stream");

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const key = `emails:${session.user.id}`;

  const redisSubscriber = RedisSubscriber.getInstance();

  redisSubscriber.subscribe(key, (err) => {
    if (err) logger.error("Error subscribing to emails", { error: err });
  });

  // Set headers for SSE
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Content-Encoding": "none",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // For anyone using Nginx
  });

  logger.info("Creating SSE stream");

  // const stream = new ReadableStream({
  //   start(controller) {
  //     logger.info("SSE stream started");
  //     const encoder = new TextEncoder();

  //     // Function to send emails at the specified rate
  //     const sendEmails = () => {
  //       // Generate batch of emails based on rate
  //       for (let i = 0; i < 5; i++) {
  //         const email = generateRandomEmail();
  //         const data = `data: ${JSON.stringify(email)}\n\n`;
  //         controller.enqueue(encoder.encode(data));
  //       }
  //     };

  //     // Send initial stats
  //     const initialStats = {
  //       type: "stats",
  //       total: 0,
  //       inbox: 0,
  //       archived: 0,
  //       deleted: 0,
  //       labeled: 0,
  //       labels: {},
  //     };
  //     controller.enqueue(
  //       encoder.encode(`data: ${JSON.stringify(initialStats)}\n\n`),
  //     );

  //     // Heartbeat to keep connection alive
  //     const heartbeat = setInterval(() => {
  //       controller.enqueue(encoder.encode(":heartbeat\n\n"));
  //     }, 15000);

  //     // Send emails every second
  //     const interval = setInterval(sendEmails, 1000);

  //     // Clean up on client disconnect
  //     request.signal.addEventListener("abort", () => {
  //       logger.info("Client disconnected from SSE");
  //       clearInterval(interval);
  //       clearInterval(heartbeat);
  //       controller.close();
  //     });
  //   },
  // });

  const encoder = new TextEncoder();

  // Create a streaming response
  const redisStream = new ReadableStream({
    start(controller) {
      redisSubscriber.on("message", (channel, message) => {
        if (channel === key) {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        }
      });

      // Handle cleanup when the stream closes
      request.signal.addEventListener("abort", () => {
        logger.info("Cleaning up Redis subscription");
        redisSubscriber.unsubscribe(key);
        // Note: We don't disconnect here since other streams might be using the connection
      });
    },
  });

  return new Response(redisStream, { headers });
}

// // This function is adapted from the client-side version
// function generateRandomEmail() {
//   const id = Math.random().toString(36).substring(2, 10);
//   const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
//   const from = SENDERS[Math.floor(Math.random() * SENDERS.length)];
//   const size = Math.floor(Math.random() * 100) + 1;
//   const timestamp = new Date().toLocaleTimeString();
//   const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
//   const label =
//     action === "label"
//       ? COMMON_LABELS[Math.floor(Math.random() * COMMON_LABELS.length)]
//       : undefined;

//   return {
//     id,
//     subject,
//     from,
//     timestamp,
//     size,
//     action,
//     label,
//   };
// }
