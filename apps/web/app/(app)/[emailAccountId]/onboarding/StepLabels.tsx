"use client";

import Image from "next/image";
import { Settings2Icon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { CategoriesSetup } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingCategories";

export function StepLabels({
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
            <Settings2Icon className="size-6" />
          </IconCircle>

          <div className="text-center mt-4">
            <PageHeading>How do you want your inbox organized?</PageHeading>
            <TypographyP className="mt-2 max-w-lg mx-auto">
              We'll use these labels to organize your inbox. You can add custom
              labels and change them later.
            </TypographyP>
          </div>

          <CategoriesSetup emailAccountId={emailAccountId} step={step} />
        </OnboardingWrapper>
      </div>

      <div className="fixed top-0 right-0 w-1/2 h-screen bg-white items-center justify-center hidden xl:flex px-10">
        <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200">
          <Image
            src="/images/assistant/labels.png"
            alt="Categorize your emails"
            width={1200}
            height={800}
            className="rounded-xl border border-slate-200"
          />
        </div>
      </div>
    </div>
  );
}
