import { SimpleList } from "@/app/(app)/simple/SimpleList";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { PageHeading } from "@/components/Typography";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload } from "@/utils/types";

export const dynamic = "force-dynamic";

export default async function SimplePage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const accessToken = token?.token;

  if (!accessToken) throw new Error("Missing access token");

  const response = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["CATEGORY_PROMOTIONS"],
    maxResults: 5,
    q: `newer_than:1d in:inbox`,
  });

  const messages = await Promise.all(
    response.data.messages?.map(async (message) => {
      const fullMessage = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
      });
      const parsedMessage = parseMessage(
        fullMessage.data as MessageWithPayload,
      );
      return parsedMessage;
    }) || [],
  );

  return (
    <div className="mx-auto max-w-2xl py-10">
      <PageHeading className="text-center">Today{`'`}s newsletters</PageHeading>
      <SimpleList messages={messages} />
    </div>
  );
}
