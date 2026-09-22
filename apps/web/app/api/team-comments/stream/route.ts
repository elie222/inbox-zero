import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { RedisSubscriber } from "@/utils/redis/subscriber";
import { env } from "@/env";
import { getAuthorizedConversation } from "@/utils/team-comments/access";
import {
  conversationChangeChannel,
  subscribeLocalConversationChange,
} from "@/utils/team-comments/events";

export const maxDuration = 300;

export const GET = withAuth("team-comments/stream", async (request) => {
  const query = new URL(request.url).searchParams;
  const memberId = query.get("memberId");
  const conversationId = query.get("conversationId");
  if (!memberId || !conversationId)
    return NextResponse.json(
      { error: "Conversation and member IDs required" },
      { status: 400 },
    );
  const actor = { userId: request.auth.userId, memberId };
  const initial = await getAuthorizedConversation(actor, conversationId);
  const generation = initial.conversation.generation;
  const subscriber = env.REDIS_URL ? RedisSubscriber.createInstance() : null;
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      let unsubscribeLocal = () => {};
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        request.signal.removeEventListener("abort", close);
        unsubscribeLocal();
        subscriber?.off("message", onMessage);
        subscriber?.disconnect();
        try {
          controller.close();
        } catch {
          /* Already closed. */
        }
      };
      cleanup = close;
      const send = (event: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
      };
      const validate = async () => {
        try {
          const current = await getAuthorizedConversation(
            actor,
            conversationId,
          );
          if (current.conversation.generation !== generation)
            throw new Error("Generation changed");
          return true;
        } catch {
          send("revoked");
          close();
          return false;
        }
      };
      const onMessage = (channel: string) => {
        if (channel !== conversationChangeChannel(conversationId)) return;
        validate().then((allowed) => {
          if (allowed) send("change");
        });
      };
      request.signal.addEventListener("abort", close);
      unsubscribeLocal = subscribeLocalConversationChange(conversationId, () =>
        onMessage(conversationChangeChannel(conversationId)),
      );
      subscriber?.on("message", onMessage);
      lifetime = setTimeout(close, 270_000);
      if (request.signal.aborted) {
        close();
        return;
      }
      subscriber
        ?.subscribe(conversationChangeChannel(conversationId))
        .catch(() => {
          subscriber.disconnect();
        });
      send("ready");
      heartbeat = setInterval(() => {
        validate().then((allowed) => {
          if (allowed) send("heartbeat");
        });
      }, 25_000);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
