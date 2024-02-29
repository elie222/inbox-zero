import { redirect } from "next/navigation";
import { SimpleList } from "@/app/(app)/simple/SimpleList";
import {
  getNextCategory,
  simpleEmailCategories,
} from "@/app/(app)/simple/categories";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { PageHeading } from "@/components/Typography";
import { getGmailClient } from "@/utils/gmail/client";
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

  const categoryTitle = simpleEmailCategories.get(type);

  const response = await gmail.users.messages.list({
    userId: "me",
    labelIds: [type],
    maxResults: 5,
    q:
      "newer_than:1d in:inbox" +
      (type === "IMPORTANT" ? "" : " -label:IMPORTANT"),
    pageToken,
  });

  // TODO need a better way to handle this. Don't want to miss messages,
  // but don't want to show the same thread twice
  // only take the latest email in each thread
  // const filteredMessages = filterDuplicateThreads(response.data.messages || []);
  const filteredMessages = response.data.messages;

  const messages = await Promise.all(
    filteredMessages?.map(async (message) => {
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
      <div className="w-full max-w-2xl">
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

function filterDuplicateThreads<T extends { threadId?: string | null }>(
  messages: T[],
): T[] {
  const threadIds = new Set();
  const filteredMessages: T[] = [];

  messages.forEach((message) => {
    if (!message.threadId) return;
    if (threadIds.has(message.threadId)) return;

    threadIds.add(message.threadId);
    filteredMessages.push(message);
  });

  return filteredMessages;
}
