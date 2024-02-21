// import { BookmarkPlusIcon } from "lucide-react";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Button } from "@/components/Button";
import { PageHeading } from "@/components/Typography";
import { extractNameFromEmail } from "@/utils/email";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { decodeSnippet } from "@/utils/gmail/decode";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload } from "@/utils/types";

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
    q: `newer_than:1d`,
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

      <div className="mt-8 grid gap-4">
        {messages.map((message) => {
          return (
            <div key={message.id} className="bg-white p-4 shadow sm:rounded-lg">
              <div className="flex">
                <div className="whitespace-nowrap font-bold">
                  {extractNameFromEmail(message.headers.from)}
                </div>
                <div className="ml-4 mr-4">{message.headers.subject}</div>
                {/* <Button className="ml-auto" color="white" size="sm">
                  <BookmarkPlusIcon className="mr-2 h-4 w-4" />
                  Read Later
                </Button> */}
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {decodeSnippet(message.snippet).replace(/\u200C/g, "")}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex justify-center">
        <Button size="2xl">Next</Button>
      </div>
    </div>
  );
}
