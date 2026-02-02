"use client";

import { PageHeading, TypographyP } from "@/components/Typography";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/new-onboarding/ContinueButton";
import { BulkUnsubscribeIllustration } from "@/app/(app)/[emailAccountId]/new-onboarding/illustrations/BulkUnsubscribeIllustration";

export function StepBulkUnsubscribe({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-end justify-center">
          <BulkUnsubscribeIllustration />
        </div>

        <PageHeading className="mb-3">Bulk Unsubscriber & Archiver</PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          See which emails you never read, and one-click unsubscribe and archive
          them. Keep your inbox clean without the manual work.
        </TypographyP>

        <ContinueButton onClick={onNext} />
      </div>
    </div>
  );
}
