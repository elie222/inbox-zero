import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { messageQuerySchema } from "@/app/api/google/messages/validation";

export type MessagesResponse = Awaited<ReturnType<typeof getMessages>>;

async function getMessages(query?: string | null) {
  const session = await auth();
  if (!session?.user) throw new SafeError("Not authenticated");

  const gmail = getGmailClient(session);

  const messages = await gmail.users.messages.list({
    userId: "me",
    maxResults: 10,
    q: `-from:me ${query || ""}`.trim(),
  });

  const fullMessages = await Promise.all(
    (messages.data.messages || []).map(async (m) => {
      const message = await getMessage(m.id!, gmail);
      return parseMessage(message);
    }),
  );

  return { messages: fullMessages };
}

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const r = messageQuerySchema.parse({ q: query });
  const result = await getMessages(r.q);
  return NextResponse.json(result);
});
