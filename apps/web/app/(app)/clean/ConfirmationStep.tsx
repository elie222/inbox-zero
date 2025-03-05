"use client";

import { useMemo } from "react";
import Image from "next/image";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { useStep } from "@/app/(app)/clean/useStep";
import { cleanInboxAction } from "@/utils/actions/clean";
import { isActionError } from "@/utils/error";
import { toastError } from "@/components/Toast";

export function ConfirmationStep({ unreadCount }: { unreadCount: number }) {
  const { onNext } = useStep();

  const estimatedTime = useMemo(() => {
    if (!unreadCount) return "calculating...";

    const secondsPerEmail = 1;
    const totalSeconds = unreadCount * secondsPerEmail;

    if (totalSeconds < 60) {
      return `${totalSeconds} seconds`;
    } else if (totalSeconds < 3600) {
      return `${Math.ceil(totalSeconds / 60)} minutes`;
    } else {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.ceil((totalSeconds % 3600) / 60);
      return `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${minutes > 1 ? "s" : ""}`;
    }
  }, [unreadCount]);

  const handleStartCleaning = async () => {
    const result = await cleanInboxAction({
      daysOld: 7,
      prompt: "",
      maxEmails: 20,
    }); // TODO: params

    if (isActionError(result)) {
      toastError({ description: result.error });
      return;
    }

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
        <li>We'll start with 20 emails as a test run</li>
        <li>Full process takes approximately {estimatedTime}</li>
        <li>
          All archived emails will be labeled as{" "}
          <Badge color="green">Archived</Badge> so you can find them later or
          restore them
        </li>
        <li>No emails are deleted - everything can be found in search</li>
      </ul>

      <div className="mt-6">
        <Button size="lg" onClick={handleStartCleaning}>
          Start Cleaning
        </Button>
      </div>
    </div>
  );
}
