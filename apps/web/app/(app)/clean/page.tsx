import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils";
import { CleanStep } from "./types";
import { IntroStep } from "@/app/(app)/clean/IntroStep";
import { ActionSelectionStep } from "@/app/(app)/clean/ActionSelectionStep";
import { LabelOptionsStep } from "@/app/(app)/clean/LabelOptionsStep";
import { TimeRangeStep } from "@/app/(app)/clean/TimeRangeStep";
import { ConfirmationStep } from "@/app/(app)/clean/ConfirmationStep";
import { ProcessingStep } from "@/app/(app)/clean/ProcessingStep";
import { getGmailClient } from "@/utils/gmail/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getInboxCount } from "@/utils/assess";
import { Loading } from "@/components/Loading";

export default async function CleanPage({
  searchParams,
}: {
  searchParams: { step: string; jobId: string };
}) {
  const step = searchParams.step
    ? Number.parseInt(searchParams.step)
    : CleanStep.INTRO;
  const jobId = searchParams.jobId;

  const session = await auth();
  if (!session?.user.email) return <div>Not authenticated</div>;

  const gmail = getGmailClient(session);
  const inboxCount = await getInboxCount(gmail);

  const renderStepContent = () => {
    switch (step) {
      case CleanStep.ARCHIVE_OR_READ:
        return <ActionSelectionStep />;

      case CleanStep.TIME_RANGE:
        return <TimeRangeStep />;

      case CleanStep.LABEL_OPTIONS:
        return <LabelOptionsStep />;

      case CleanStep.FINAL_CONFIRMATION:
        return <ConfirmationStep unreadCount={inboxCount} />;

      case CleanStep.PROCESSING:
        return (
          <Suspense fallback={<Loading />}>
            <ProcessingStep
              userId={session.user.id}
              jobId={jobId}
              userEmail={session.user.email || ""}
            />
          </Suspense>
        );

      // first / default step
      default:
        return <IntroStep unreadCount={inboxCount} />;
    }
  };

  return (
    <div>
      <Card className={cn("mt-4 max-w-2xl p-6 sm:mx-4 md:mx-auto")}>
        {renderStepContent()}
      </Card>
    </div>
  );
}
