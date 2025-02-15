import { Suspense } from "react";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { EmailList } from "@/components/email-list/EmailList";
import { getThreads } from "@/app/api/google/threads/controller";
import { Button } from "@/components/ui/button";
import { getGmailBasicSearchUrl } from "@/utils/url";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { OpenMultipleGmailButton } from "@/app/(app)/simple/completed/OpenMultipleGmailButton";
import { SimpleProgressCompleted } from "@/app/(app)/simple/SimpleProgress";
import { ShareOnTwitterButton } from "@/app/(app)/simple/completed/ShareOnTwitterButton";

export default async function SimpleCompletedPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const { threads } = await getThreads({ q: "newer_than:1d in:inbox" });

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
