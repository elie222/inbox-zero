import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getLiveStreamId, stopChatRun } from "@/utils/chat/active-run";
import { stopAssistantChatSchema } from "@/utils/actions/assistant-chat.validation";
import { sleep } from "@/utils/sleep";

const RUN_END_POLL_MS = 250;
const RUN_END_TIMEOUT_MS = 5000;

export const POST = withEmailAccount(
  "chat/stop",
  async (request, { params }) => {
    const { id } = await params;

    const { data, error } = stopAssistantChatSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (error) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const chat = await prisma.chat.findFirst({
      where: { id, emailAccountId: request.auth.emailAccountId },
      select: { activeStreamId: true, activeStreamStartedAt: true },
    });

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const activeStreamId = getLiveStreamId(chat);

    // A stop for an earlier reply must not cancel one started since.
    if (
      !activeStreamId ||
      (data.activeStreamId && data.activeStreamId !== activeStreamId)
    ) {
      return NextResponse.json({ success: true });
    }

    // The cancelled run saves the reply as it stood, so assistant messages,
    // which confirmations trust, stay server-written. Waiting for it lets the
    // client refetch the saved reply as soon as this returns. Only the run
    // clears its marker, so an unconfirmed stop can't free the chat for a
    // second reply while the first is still going.
    await stopChatRun(activeStreamId, request.logger);
    if (!(await waitForRunToEnd(id, activeStreamId))) {
      request.logger.warn("Stopped assistant chat run did not end in time");
      return NextResponse.json({ success: false }, { status: 504 });
    }

    return NextResponse.json({ success: true });
  },
);

async function waitForRunToEnd(chatId: string, streamId: string) {
  for (let waited = 0; waited < RUN_END_TIMEOUT_MS; waited += RUN_END_POLL_MS) {
    await sleep(RUN_END_POLL_MS);
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { activeStreamId: true },
    });
    if (chat?.activeStreamId !== streamId) return true;
  }
  return false;
}
