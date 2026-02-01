"use client";

import { PageHeading, TypographyP } from "@/components/Typography";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/new-onboarding/ContinueButton";
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

        <ContinueButton onClick={onNext} />
      </div>
    </div>
  );
}
