"use client";

// import { useMemo } from "react";
import Image from "next/image";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { useStep } from "@/app/(app)/clean/useStep";
import { cleanInboxAction } from "@/utils/actions/clean";
import { isActionError } from "@/utils/error";
import { toastError } from "@/components/Toast";
import { CleanAction } from "@prisma/client";
import { useSkipSettings } from "@/app/(app)/clean/useSkipSettings";

const TEST_RUN_COUNT = 50;

export function ConfirmationStep({
  unhandledCount,
}: {
  unhandledCount: number;
}) {
  const { onNext } = useStep();
  const [, setJobId] = useQueryState("jobId", parseAsString);
  const [, setIsPreviewBatch] = useQueryState("isPreviewBatch", parseAsBoolean);

  // values from previous steps
  const [action] = useQueryState(
    "action",
    parseAsStringEnum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  );
  const [timeRange] = useQueryState("timeRange", parseAsInteger);
  const [instructions] = useQueryState("instructions", parseAsString);
  const [skips] = useSkipSettings();

  // const estimatedTime = useMemo(() => {
  //   if (!unhandledCount) return "calculating...";

  //   const secondsPerEmail = 1;
  //   const totalSeconds = unhandledCount * secondsPerEmail;

  //   if (totalSeconds < 60) {
  //     return `${totalSeconds} seconds`;
  //   } else if (totalSeconds < 3600) {
  //     return `${Math.ceil(totalSeconds / 60)} minutes`;
  //   } else {
  //     const hours = Math.floor(totalSeconds / 3600);
  //     const minutes = Math.ceil((totalSeconds % 3600) / 60);
  //     return `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${minutes > 1 ? "s" : ""}`;
  //   }
  // }, [unhandledCount]);

  const handleStartCleaning = async () => {
    const result = await cleanInboxAction({
      daysOld: timeRange ?? 7,
      instructions: instructions || "",
      action: action || CleanAction.ARCHIVE,
      maxEmails: TEST_RUN_COUNT,
      skips: {
        reply: skips.skipReply,
        starred: skips.skipStarred,
        calendar: skips.skipCalendar,
        receipt: skips.skipReceipt,
        attachment: skips.skipAttachment,
      },
    });

    if (isActionError(result)) {
      toastError({ description: result.error });
      return;
    }

    setJobId(result.jobId);
    setIsPreviewBatch(true);

    onNext();
  };

  return (
    <div className="text-center">
      <Image
        src="https://illustrations.popsy.co/amber/business-success-chart.svg"
        alt="clean up"
        width={200}
        height={200}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <TypographyH3 className="mt-2">Ready to clean up your inbox</TypographyH3>

      <ul className="mx-auto mt-4 max-w-prose list-disc space-y-2 pl-4 text-left">
        <li>We'll start with {TEST_RUN_COUNT} emails as a test run</li>
        {/* TODO: we should count only emails we're processing */}
        {/* <li>
          The full process to handle {unhandledCount} emails will take
          approximately {estimatedTime}
        </li> */}
        <li>
          {action === CleanAction.ARCHIVE ? (
            <>
              Emails we archive will be labeled as{" "}
              <Badge color="green">Archived</Badge>
            </>
          ) : (
            <>
              Emails we mark as read will be labeled as{" "}
              <Badge color="green">Read</Badge>
            </>
          )}{" "}
          so you can find them later or restore them
        </li>
        <li>No emails are deleted - everything can be found in search</li>
      </ul>

      <div className="mt-6">
        <Button size="lg" onClick={handleStartCleaning}>
          Start Test Run
        </Button>
      </div>
    </div>
  );
}
