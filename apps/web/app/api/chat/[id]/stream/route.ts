import { NextResponse } from "next/server";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getChatStreamContext } from "@/utils/chat/active-run";

export const maxDuration = 800;

export const GET = withEmailAccount(
  "chat/stream",
  async (request, { params }) => {
    const { id } = await params;

    const chat = await prisma.chat.findFirst({
      where: {
        id,
        emailAccountId: request.auth.emailAccountId,
        deletedAt: null,
      },
      select: { activeStreamId: true },
    });

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const streamContext = getChatStreamContext();
    if (!chat.activeStreamId || !streamContext) {
      return new Response(null, { status: 204 });
    }

    const stream = await streamContext
      .resumeExistingStream(chat.activeStreamId)
      .catch((error) => {
        request.logger.warn("Failed to resume chat stream", { error });
        return null;
      });

    if (!stream) return new Response(null, { status: 204 });

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  },
);
