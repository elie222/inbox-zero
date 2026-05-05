import { NextResponse } from "next/server";
import { confirmAssistantEmailActionForAccount } from "@/utils/actions/assistant-chat-confirmation";
import { confirmAssistantEmailActionBody } from "@/utils/actions/assistant-chat.validation";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";

export const maxDuration = 120;
const MOBILE_PENDING_ACTION_PERSIST_WAIT_MS = 10_000;

// Mobile clients call this endpoint directly; web uses the server action path.
export const POST = withEmailAccount(
  "chat/confirm-email-action",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const user = await getEmailAccountWithAi({ emailAccountId });
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { data, error } = confirmAssistantEmailActionBody.safeParse(json);
    if (error) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }

    const result = await confirmAssistantEmailActionForAccount({
      chatId: data.chatId,
      chatMessageId: data.chatMessageId,
      toolCallId: data.toolCallId,
      actionType: data.actionType,
      contentOverride: data.contentOverride,
      waitForPersistence: true,
      persistenceWaitMs: MOBILE_PENDING_ACTION_PERSIST_WAIT_MS,
      emailAccountId,
      provider: user.account.provider,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
