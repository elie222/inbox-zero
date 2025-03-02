"use client";

import { useMemo } from "react";
import Image from "next/image";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { useStep } from "@/app/(app)/clean/useStep";

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
          All cleaned emails will be labeled as{" "}
          <Badge color="green">Cleaned</Badge> so you can find them later or
          restore them
        </li>
        <li>No emails are deleted - everything can be found in search</li>
      </ul>

      <div className="mt-6">
        <Button onClick={onNext}>Start Cleaning</Button>
      </div>
    </div>
  );
}
