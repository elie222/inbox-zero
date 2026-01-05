import { Suspense } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { IntroStep } from "@/app/(app)/[emailAccountId]/clean/IntroStep";
import { ActionSelectionStep } from "@/app/(app)/[emailAccountId]/clean/ActionSelectionStep";
import { CleanInstructionsStep } from "@/app/(app)/[emailAccountId]/clean/CleanInstructionsStep";
import { TimeRangeStep } from "@/app/(app)/[emailAccountId]/clean/TimeRangeStep";
import { ConfirmationStep } from "@/app/(app)/[emailAccountId]/clean/ConfirmationStep";
import { getUnhandledCount } from "@/utils/assess";
import { CleanStep } from "@/app/(app)/[emailAccountId]/clean/types";
import { CleanAction } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

export default async function CleanPage(props: {
  params: Promise<{ emailAccountId: string }>;
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
  const { emailAccountId } = await props.params;
  const searchParams = await props.searchParams;

  await checkUserOwnsEmailAccount({ emailAccountId });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: { select: { provider: true } },
    },
  });

  if (!emailAccount) {
    return <CardTitle>Email account not found</CardTitle>;
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
    logger: createScopedLogger("clean-onboarding").with({ emailAccountId }),
  });
  const { unhandledCount } = await getUnhandledCount(emailProvider);

  const step = Number.parseInt(searchParams.step || "") || CleanStep.INTRO;

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
        <Suspense
          key={step}
          fallback={
            <div className="flex h-[400px] items-center justify-center">
              Loading...
            </div>
          }
        >
          {renderStepContent()}
        </Suspense>
      </Card>
    </div>
  );
}
