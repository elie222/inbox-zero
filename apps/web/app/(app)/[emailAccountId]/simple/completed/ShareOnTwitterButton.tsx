"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSimpleProgress } from "@/app/(app)/[emailAccountId]/simple/SimpleProgressProvider";
import {
  calculateTimePassed,
  formatTime,
} from "@/app/(app)/[emailAccountId]/simple/SimpleProgress";

export function ShareOnTwitterButton() {
  const { handled, startTime, endTime } = useSimpleProgress();

  return (
    <Button asChild variant="outline">
      <Link
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just completed the daily inbox zero challenge!

I cleaned up ${Object.keys(handled).length} emails in ${formatTime(
          calculateTimePassed(endTime || new Date(), startTime),
        )} minutes!

Thanks @inboxzero_ai!`)}`}
        target="_blank"
      >
        Share on Twitter
        <ExternalLinkIcon className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}
