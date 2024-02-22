import { redirect } from "next/navigation";
import { SimpleList } from "@/app/(app)/simple/SimpleList";
import {
  getNextCategory,
  simpleEmailCategories,
} from "@/app/(app)/simple/categories";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { PageHeading } from "@/components/Typography";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload } from "@/utils/types";

export const dynamic = "force-dynamic";

export default async function SimplePage({
  searchParams: { pageToken, type = "IMPORTANT" },
}: {
  searchParams: { pageToken?: string; type?: string };
}) {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const accessToken = token?.token;

  if (!accessToken) throw new Error("Missing access token");

  const categoryTitle = simpleEmailCategories.get(type);

  const response = await gmail.users.messages.list({
    userId: "me",
    labelIds: [type],
    maxResults: 5,
    q: `newer_than:1d in:inbox`,
    pageToken,
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

  if (!messages.length) {
    const next = getNextCategory(type);
    if (next) {
      return redirect(`/simple?type=${next}`);
    } else {
      return redirect(`/simple/completed`);
    }
  }

  const title = `Today's ${categoryTitle} emails`;

  return (
    <div className="flex justify-center py-10">
      <div className="w-full max-w-3xl">
        <PageHeading className="text-center">{title}</PageHeading>
        <SimpleList
          messages={messages}
          nextPageToken={response.data.nextPageToken}
          userEmail={email}
          type={type}
        />
      </div>
    </div>
  );
}
