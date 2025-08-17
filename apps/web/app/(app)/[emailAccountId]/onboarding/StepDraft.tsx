"use client";

import Image from "next/image";
import { CheckIcon, PenIcon, XIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { Button } from "@/components/ui/button";

export function StepDraft({
  emailAccountId,
  step,
}: {
  emailAccountId: string;
  step: number;
}) {
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
              onClick={() => {}}
            />

            <OnboardingButton
              text="No, thanks"
              icon={<XIcon className="size-4" />}
              onClick={() => {}}
            />
          </div>
        </OnboardingWrapper>
      </div>

      <div className="fixed top-0 right-0 w-1/2 h-screen bg-white items-center justify-center hidden xl:flex px-10">
        <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200">
          <Image
            src="/images/onboarding/extension.png"
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

function OnboardingButton({
  text,
  icon,
  onClick,
}: {
  text: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm text-left flex items-center gap-4 transition-all hover:border-blue-600 hover:ring-2 hover:ring-blue-100"
      onClick={onClick}
    >
      <IconCircle size="sm">{icon}</IconCircle>

      <div className="font-medium">{text}</div>
    </button>
  );
}
