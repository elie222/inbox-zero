import { Suspense } from "react";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { EmailList } from "@/components/email-list/EmailList";
import { getThreads } from "@/app/api/google/threads/controller";
import { Button } from "@/components/ui/button";
import { getGmailBasicSearchUrl } from "@/utils/url";
import { OpenMultipleGmailButton } from "@/app/(app)/[account]/simple/completed/OpenMultipleGmailButton";
import { SimpleProgressCompleted } from "@/app/(app)/[account]/simple/SimpleProgress";
import { ShareOnTwitterButton } from "@/app/(app)/[account]/simple/completed/ShareOnTwitterButton";
import { getTokens } from "@/utils/account";
import { getGmailClient, getGmailAccessToken } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";

export default async function SimpleCompletedPage(props: {
  params: Promise<{ account: string }>;
}) {
  const params = await props.params;

  const tokens = await getTokens({ email: params.account });

  const gmail = getGmailClient(tokens);
  const token = await getGmailAccessToken(tokens);

  if (!token.token) throw new Error("Account not found");

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: params.account },
    select: { email: true },
  });

  if (!emailAccount) throw new Error("Account not found");

  const email = emailAccount.email;

  const { threads } = await getThreads({
    query: { q: "newer_than:1d in:inbox" },
    gmail,
    accessToken: token.token,
    email: emailAccount.email,
  });

  return (
    <div>
      <div className="mb-2 mt-8 px-8">
        <div className="text-center font-cal text-2xl leading-10 text-primary">
          <p>
            🥳 Great job!
            {!!threads.length && " Here are the emails you set aside!"}
          </p>
        </div>

        <div className="mt-2 text-center">
          <SimpleProgressCompleted />
        </div>

        {!!threads.length && (
          <div className="mt-4 grid gap-2 text-center sm:block sm:space-x-2">
            <Button asChild variant="outline">
              <Link
                href={getGmailBasicSearchUrl(email, "newer_than:1d in:inbox")}
                target="_blank"
              >
                View in Gmail
                <ExternalLinkIcon className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <OpenMultipleGmailButton
              threadIds={threads.map((t) => t.id)}
              userEmail={email}
            />

            <ShareOnTwitterButton />
          </div>
        )}
      </div>

      <Suspense>
        <EmailList
          threads={threads}
          hideActionBarWhenEmpty
          // refetch={() => mutate()}
        />
      </Suspense>
    </div>
  );
}
