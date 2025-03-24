import { Card } from "@/components/ui/card";
import { IntroStep } from "@/app/(app)/clean/IntroStep";
import { ActionSelectionStep } from "@/app/(app)/clean/ActionSelectionStep";
import { CleanInstructionsStep } from "@/app/(app)/clean/CleanInstructionsStep";
import { TimeRangeStep } from "@/app/(app)/clean/TimeRangeStep";
import { ConfirmationStep } from "@/app/(app)/clean/ConfirmationStep";
import { getGmailClient } from "@/utils/gmail/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getUnhandledCount } from "@/utils/assess";
import { CleanStep } from "@/app/(app)/clean/types";
import { CleanAction } from "@prisma/client";

export default async function CleanPage(props: {
  searchParams: Promise<{
    step: string;
    action?: CleanAction;
    timeRange?: string;
    instructions?: string;
    skipReply?: string;
    skipStarred?: string;
    skipCalendar?: string;
    skipReceipt?: string;
    skipAttachment?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user.email) return <div>Not authenticated</div>;

  const gmail = getGmailClient(session);
  const { unhandledCount } = await getUnhandledCount(gmail);

  const searchParams = await props.searchParams;
  const step = searchParams.step
    ? Number.parseInt(searchParams.step)
    : CleanStep.INTRO;

  const renderStepContent = () => {
    switch (step) {
      case CleanStep.ARCHIVE_OR_READ:
        return <ActionSelectionStep />;

      case CleanStep.TIME_RANGE:
        return <TimeRangeStep />;

      case CleanStep.LABEL_OPTIONS:
        return <CleanInstructionsStep />;

      case CleanStep.FINAL_CONFIRMATION:
        return (
          <ConfirmationStep
            showFooter={false}
            action={searchParams.action ?? CleanAction.ARCHIVE}
            timeRange={
              searchParams.timeRange
                ? Number.parseInt(searchParams.timeRange)
                : 7
            }
            instructions={searchParams.instructions}
            skips={{
              reply: searchParams.skipReply === "true",
              starred: searchParams.skipStarred === "true",
              calendar: searchParams.skipCalendar === "true",
              receipt: searchParams.skipReceipt === "true",
              attachment: searchParams.skipAttachment === "true",
            }}
            reuseSettings={false}
          />
        );

      // first / default step
      default:
        return (
          <IntroStep unhandledCount={unhandledCount} cleanAction={"ARCHIVE"} />
        );
    }
  };

  return (
    <div>
      <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
        {renderStepContent()}
      </Card>
    </div>
  );
}
