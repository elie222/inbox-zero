import { NextResponse } from "next/server";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getChatStreamContext, getLiveStreamId } from "@/utils/chat/active-run";
import { sleep } from "@/utils/sleep";

export const maxDuration = 800;

const REGISTRATION_POLL_MS = 500;
const REGISTRATION_TIMEOUT_MS = 15_000;

export const GET = withEmailAccount(
  "chat/stream",
  async (request, { params }) => {
    const { id } = await params;
    const { emailAccountId } = request.auth;

    const chat = await getChat(id, emailAccountId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const streamContext = getChatStreamContext();
    const streamId = getLiveStreamId(chat);
    if (!streamId || !streamContext) {
      return new Response(null, { status: 204 });
    }

    // A reply is marked active before its stream exists, while the model is
    // still being set up, so wait briefly for the stream to appear.
    for (
      let waited = 0;
      waited <= REGISTRATION_TIMEOUT_MS && !request.signal.aborted;
      waited += REGISTRATION_POLL_MS
    ) {
      const stream = await streamContext
        .resumeExistingStream(streamId)
        .catch((error) => {
          request.logger.warn("Failed to resume chat stream", { error });
          return null;
        });

      if (stream) {
        return new Response(stream.pipeThrough(new TextEncoderStream()), {
          headers: UI_MESSAGE_STREAM_HEADERS,
        });
      }
      // null means the stream already finished.
      if (stream === null) break;

      await sleep(REGISTRATION_POLL_MS);
      const latest = await getChat(id, emailAccountId);
      if (!latest || getLiveStreamId(latest) !== streamId) break;
    }

    return new Response(null, { status: 204 });
  },
);

function getChat(id: string, emailAccountId: string) {
  return prisma.chat.findFirst({
    where: { id, emailAccountId, deletedAt: null },
    select: { activeStreamId: true, activeStreamStartedAt: true },
  });
}
