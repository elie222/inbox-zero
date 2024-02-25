import { Suspense } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { EmailList } from "@/components/email-list/EmailList";
import { getThreads } from "@/app/api/google/threads/route";
import { Button } from "@/components/ui/button";
// import { SimpleProgress } from "@/app/(app)/simple/SimpleProgress";
// import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getGmailBasicSearchUrl } from "@/utils/url";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

export default async function SimpleCompletedPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const { threads } = await getThreads({ q: "newer_than:1d in:inbox" });

  // const emailsHandled = Object.keys(handled).length
  // const emailsToHandleLater = Object.keys(toHandleLater).length

  return (
    <div className="">
      <div className="py-8 text-center font-cal text-2xl leading-10 text-gray-900">
        <p>🥳 Great job!</p>
        <p>Here are the emails you set aside.</p>

        <div className="mt-4">
          <Button asChild variant="outline">
            <Link
              href={getGmailBasicSearchUrl(email, "newer_than:1d in:inbox")}
              target="_blank"
            >
              View in Gmail
              <ExternalLinkIcon className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* <Badge variant="outline">{emailsHandled} handled</Badge>
        <Badge variant="outline">
          {emailsToHandleLater} to handle later
        </Badge> */}
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
