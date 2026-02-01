"use client";

import { useCallback } from "react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { enableDraftRepliesAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
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

        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button className="w-full" onClick={() => onSetDraftReplies("yes")}>
            Yes, draft replies
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onSetDraftReplies("no")}
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
