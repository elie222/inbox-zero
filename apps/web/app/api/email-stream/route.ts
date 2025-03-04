import type { NextRequest } from "next/server";
import {
  ACTIONS,
  COMMON_LABELS,
  SENDERS,
  SUBJECTS,
} from "@/app/(app)/clean/email-constants";

// This function is adapted from the client-side version
function generateRandomEmail() {
  const id = Math.random().toString(36).substring(2, 10);
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const from = SENDERS[Math.floor(Math.random() * SENDERS.length)];
  const size = Math.floor(Math.random() * 100) + 1;
  const timestamp = new Date().toLocaleTimeString();
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const label =
    action === "label"
      ? COMMON_LABELS[Math.floor(Math.random() * COMMON_LABELS.length)]
      : undefined;

  return {
    id,
    subject,
    from,
    timestamp,
    size,
    action,
    label,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const rate = Number.parseInt(searchParams.get("rate") || "5", 10);
  // Set headers for SSE
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // For anyone using Nginx
  });

  console.log("Creating SSE stream");

  const stream = new ReadableStream({
    start(controller) {
      console.log("SSE stream started");
      const encoder = new TextEncoder();

      // Function to send emails at the specified rate
      const sendEmails = () => {
        // Generate batch of emails based on rate
        for (let i = 0; i < rate; i++) {
          const email = generateRandomEmail();
          const data = `data: ${JSON.stringify(email)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      };

      // Send initial stats
      const initialStats = {
        type: "stats",
        total: 0,
        inbox: 0,
        archived: 0,
        deleted: 0,
        labeled: 0,
        labels: {},
        rate: rate,
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialStats)}\n\n`),
      );

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(":heartbeat\n\n"));
      }, 15000);

      // Send emails every second
      const interval = setInterval(sendEmails, 1000);

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        console.log("Client disconnected from SSE");
        clearInterval(interval);
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(stream, { headers });
}
