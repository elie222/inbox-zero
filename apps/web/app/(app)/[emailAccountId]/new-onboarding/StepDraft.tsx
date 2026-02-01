"use client";

import { useCallback } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { enableDraftRepliesAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
import { OnboardingButton } from "@/app/(app)/[emailAccountId]/new-onboarding/OnboardingButton";
import { DraftRepliesIllustration } from "@/app/(app)/[emailAccountId]/new-onboarding/illustrations/DraftRepliesIllustration";

export function StepDraft({
  emailAccountId,
  onNext,
}: {
  emailAccountId: string;
  provider: string;
  onNext: () => void;
}) {
  const onSetDraftReplies = useCallback(
    async (value: string) => {
      const result = await enableDraftRepliesAction(emailAccountId, {
        enable: value === "yes",
      });

      if (result?.serverError) {
        toastError({
          description: `There was an error: ${result.serverError || ""}`,
        });
      }

      onNext();
    },
    [onNext, emailAccountId],
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-end justify-center">
          <DraftRepliesIllustration />
        </div>

        <PageHeading className="mb-3">
          Should we draft replies for you?
        </PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          The drafts will appear in your inbox, written in your tone. Our AI
          learns from your previous conversations to draft the best reply.
        </TypographyP>

        <div className="grid gap-2 w-full max-w-xs">
          <OnboardingButton
            text="Yes, please"
            icon={<CheckIcon className="size-4" />}
            onClick={() => onSetDraftReplies("yes")}
          />

          <OnboardingButton
            text="No, thanks"
            icon={<XIcon className="size-4" />}
            onClick={() => onSetDraftReplies("no")}
          />
        </div>
      </div>
    </div>
  );
}
