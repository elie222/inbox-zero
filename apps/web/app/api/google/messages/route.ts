import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { messageQuerySchema } from "@/app/api/google/messages/validation";
import { isDefined } from "@/utils/types";

export type MessagesResponse = Awaited<ReturnType<typeof getMessages>>;

async function getMessages({
  query,
  pageToken,
}: {
  query?: string | null;
  pageToken?: string | null;
}) {
  const session = await auth();
  if (!session?.user.email) throw new SafeError("Not authenticated");

  const gmail = getGmailClient(session);

  const messages = await gmail.users.messages.list({
    userId: "me",
    maxResults: 20,
    pageToken: pageToken ?? undefined,
    q: query?.trim(),
  });

  const fullMessages = (
    await Promise.all(
      (messages.data.messages || []).map(async (m) => {
        if (!m.id) return null;
        const message = await getMessage(m.id, gmail);
        return parseMessage(message);
      }),
    )
  ).filter(isDefined);

  // filter out messages from the user
  // NOTE: -from:me doesn't work because it filters out messages from threads where the user responded
  const incomingMessages = fullMessages.filter(
    (message) => !message.headers.from.includes(session.user.email!),
  );

  return {
    messages: incomingMessages,
    nextPageToken: messages.data.nextPageToken,
  };
}

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const pageToken = searchParams.get("page");
  const r = messageQuerySchema.parse({ q: query, pageToken });
  const result = await getMessages({
    query: r.q,
    pageToken: r.pageToken,
  });
  return NextResponse.json(result);
});
