"use client";

import { ArrowRightIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { DraftRepliesIllustration } from "@/app/(app)/[emailAccountId]/new-onboarding/illustrations/DraftRepliesIllustration";

export function StepDraftReplies({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-end justify-center">
          <DraftRepliesIllustration />
        </div>

        <PageHeading className="mb-3">Pre-drafted replies</PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          When you check your inbox, every email needing a response will have a
          pre-drafted reply in your tone, ready for you to send.
        </TypographyP>

        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button className="w-full" onClick={onNext}>
            Continue
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
