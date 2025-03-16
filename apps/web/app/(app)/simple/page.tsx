import { redirect, RedirectType } from "next/navigation";
import { SimpleList } from "@/app/(app)/simple/SimpleList";
import {
  getNextCategory,
  simpleEmailCategories,
  simpleEmailCategoriesArray,
} from "@/app/(app)/simple/categories";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { PageHeading } from "@/components/Typography";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { SimpleModeOnboarding } from "@/app/(app)/simple/SimpleModeOnboarding";
import { ClientOnly } from "@/components/ClientOnly";
import { getMessage, getMessages } from "@/utils/gmail/message";

export const dynamic = "force-dynamic";

export default async function SimplePage(props: {
  searchParams: Promise<{ pageToken?: string; type?: string }>;
}) {
  const searchParams = await props.searchParams;

  const { pageToken, type = "IMPORTANT" } = searchParams;

  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);

  const categoryTitle = simpleEmailCategories.get(type);

  const response = await getMessages(gmail, {
    labelIds: type === "OTHER" ? undefined : [type],
    maxResults: 5,
    query: getQuery(type),
    pageToken,
  });

  // TODO need a better way to handle this. Don't want to miss messages,
  // but don't want to show the same thread twice
  // only take the latest email in each thread
  // const filteredMessages = filterDuplicateThreads(response.data.messages || []);
  const filteredMessages = response.messages;

  const messages = await Promise.all(
    filteredMessages?.map(async (message) => {
      const m = await getMessage(message.id!, gmail);
      return parseMessage(m);
    }) || [],
  );

  if (!messages.length) {
    const next = getNextCategory(type);
    if (next) {
      redirect(`/simple?type=${next}`, RedirectType.replace);
    } else {
      redirect("/simple/completed", RedirectType.replace);
    }
  }

  const title = `Today's ${categoryTitle} emails`;

  return (
    <div className="flex justify-center py-10">
      <div className="w-full max-w-2xl">
        <PageHeading className="text-center">{title}</PageHeading>
        <SimpleList
          messages={messages}
          nextPageToken={response.nextPageToken}
          userEmail={email}
          type={type}
        />
        <ClientOnly>
          <SimpleModeOnboarding />
        </ClientOnly>
      </div>
    </div>
  );
}

function getQuery(type: string): string {
  const base = "newer_than:1d in:inbox";

  if (type === "IMPORTANT") return `${base} -label:IMPORTANT`;

  if (type === "OTHER")
    return `${base} ${simpleEmailCategoriesArray
      .map(([id]) => (id === "OTHER" ? "" : `-label:${id}`))
      .join(" ")}`;

  return base;
}

// function filterDuplicateThreads<T extends { threadId?: string | null }>(
//   messages: T[],
// ): T[] {
//   const threadIds = new Set();
//   const filteredMessages: T[] = [];

//   messages.forEach((message) => {
//     if (!message.threadId) return;
//     if (threadIds.has(message.threadId)) return;

//     threadIds.add(message.threadId);
//     filteredMessages.push(message);
//   });

//   return filteredMessages;
// }
