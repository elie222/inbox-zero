"use client";

import Image from "next/image";
import { MailsIcon } from "lucide-react";
import { IconCircle } from "@/app/(landing)/onboarding/IconCircle";
import { PageHeading, TypographyP } from "@/components/Typography";
import { OnboardingWrapper } from "@/app/(landing)/onboarding/OnboardingWrapper";
import { ContinueButton } from "@/app/(landing)/onboarding/ContinueButton";

export function StepDigest() {
  console.log("StepDigest");
  return (
    <div className="grid xl:grid-cols-2">
      <OnboardingWrapper className="py-0">
        <IconCircle size="lg" className="mx-auto">
          <MailsIcon className="size-6" />
        </IconCircle>

        <div className="text-center mt-4">
          <PageHeading>Which emails do you want in your digest?</PageHeading>
          <TypographyP className="mt-2 max-w-lg mx-auto">
            Get a beautiful daily email summarizing what happened in your inbox
            today. Read your inbox in 30 seconds instead of 30 minutes.
          </TypographyP>
        </div>

        {/* TODO */}

        <div className="flex justify-center mt-8">
          <ContinueButton href="/onboarding?step=4" />
        </div>
      </OnboardingWrapper>

      <div className="bg-white h-screen items-center justify-center hidden xl:flex">
        <div className="ml-auto text-muted-foreground rounded-tl-2xl rounded-bl-2xl pl-4 py-4 bg-slate-50 border-y border-l border-slate-200 overflow-hidden">
          <Image
            src="/images/onboarding/digest.png"
            alt="Digest Email Example"
            width={672}
            height={1200}
            className="rounded-tl-xl rounded-bl-xl border-y border-l border-slate-200"
          />
        </div>
      </div>
    </div>
  );
}
