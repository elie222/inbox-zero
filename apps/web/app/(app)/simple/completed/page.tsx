import { Suspense } from "react";
import { EmailList } from "@/components/email-list/EmailList";
import { getThreads } from "@/app/api/google/threads/route";

export default async function SimpleCompletedPage() {
  const { threads } = await getThreads({ q: "newer_than:1d in:inbox" });

  return (
    <div className="">
      <div className="py-8 text-center font-cal text-2xl leading-10 text-gray-900">
        <p>🥳 Great job!</p>
        <p>Here are the emails you set aside.</p>
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
