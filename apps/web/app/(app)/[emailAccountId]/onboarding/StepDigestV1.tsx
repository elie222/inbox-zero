"use client";

import { MailsIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { ContinueButtonLink } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { DigestItemsForm } from "@/app/(app)/[emailAccountId]/settings/DigestItemsForm";
import { DigestScheduleForm } from "@/app/(app)/[emailAccountId]/settings/DigestScheduleForm";
import { prefixPath } from "@/utils/path";
import { OnboardingImagePreview } from "@/app/(app)/[emailAccountId]/onboarding/ImagePreview";

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
          <ContinueButtonLink
            href={prefixPath(emailAccountId, "/onboarding?step=5")}
          />
        </div>
      </OnboardingWrapper>

      <div className="fixed top-0 right-0 w-1/2 bg-white h-screen items-center justify-center hidden xl:flex">
        <OnboardingImagePreview
          src="/images/onboarding/digest.png"
          alt="Digest Email Example"
          width={672}
          height={1200}
        />
      </div>
    </div>
  );
}
