import { redirect } from "next/navigation";
import { getLastJob } from "@/app/(app)/clean/helpers";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ConfirmationStep } from "@/app/(app)/clean/ConfirmationStep";
import { Card } from "@/components/ui/card";

export default async function CleanPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) return <div>Not authenticated</div>;

  const lastJob = await getLastJob({ email });
  if (!lastJob) redirect("/clean/onboarding");

  return (
    <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <ConfirmationStep
        showFooter
        action={lastJob.action}
        timeRange={lastJob.daysOld}
        instructions={lastJob.instructions ?? undefined}
        skips={{
          reply: lastJob.skipReply ?? true,
          starred: lastJob.skipStarred ?? true,
          calendar: lastJob.skipCalendar ?? true,
          receipt: lastJob.skipReceipt ?? false,
          attachment: lastJob.skipAttachment ?? false,
        }}
        reuseSettings={true}
      />
    </Card>
  );
}
