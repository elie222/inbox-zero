"use client";

import Image from "next/image";
import { MailsIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { ContinueButtonLink } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { DigestItemsForm } from "@/app/(app)/[emailAccountId]/settings/DigestItemsForm";
import { DigestScheduleForm } from "@/app/(app)/[emailAccountId]/settings/DigestScheduleForm";
import { prefixPath } from "@/utils/path";

export function StepDigest({ emailAccountId }: { emailAccountId: string }) {
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

        <DigestItemsForm showSaveButton={false} />
        <DigestScheduleForm showSaveButton={false} />

        <div className="flex justify-center mt-8">
          <ContinueButtonLink href={prefixPath(emailAccountId, "/setup")} />
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
