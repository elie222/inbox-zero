"use client";

import Image from "next/image";
import { CheckIcon, PenIcon, XIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { useCallback } from "react";
import { enableDraftRepliesAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
import { OnboardingButton } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingButton";

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
    <div className="relative">
      <div className="xl:pr-[50%]">
        <OnboardingWrapper className="py-0">
          <IconCircle size="lg" className="mx-auto">
            <PenIcon className="size-6" />
          </IconCircle>

          <div className="text-center mt-4">
            <PageHeading>Should we draft replies for you?</PageHeading>
            <TypographyP className="mt-2 max-w-lg mx-auto">
              The drafts will appear in your inbox, written in your tone.
              <br />
              Our AI learns from your previous conversations to draft the best
              reply.
            </TypographyP>
          </div>

          <div className="mt-4 grid gap-2">
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
        </OnboardingWrapper>
      </div>

      <div className="fixed top-0 right-0 w-1/2 h-screen bg-white items-center justify-center hidden xl:flex px-10">
        <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200">
          <Image
            src="/images/onboarding/draft.png"
            alt="Draft replies"
            width={1200}
            height={800}
            className="rounded-xl border border-slate-200"
          />
        </div>
      </div>
    </div>
  );
}
