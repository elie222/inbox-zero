import { redirect } from "next/navigation";
import { getLastJob } from "@/app/(app)/[emailAccountId]/clean/helpers";
import { ConfirmationStep } from "@/app/(app)/[emailAccountId]/clean/ConfirmationStep";
import { Card } from "@/components/ui/card";

export default async function CleanPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { account } = await params;

  const lastJob = await getLastJob({ accountId: account });
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
