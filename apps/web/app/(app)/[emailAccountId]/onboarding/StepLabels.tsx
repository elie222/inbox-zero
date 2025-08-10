"use client";

import Image from "next/image";
import { Settings2Icon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { CategoriesSetup } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingCategories";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { prefixPath } from "@/utils/path";

export function StepLabels({ emailAccountId }: { emailAccountId: string }) {
  return (
    <div className="grid xl:grid-cols-2">
      <OnboardingWrapper className="py-0">
        <IconCircle size="lg" className="mx-auto">
          <Settings2Icon className="size-6" />
        </IconCircle>

        <div className="text-center mt-4">
          <PageHeading>How do you want your inbox organized?</PageHeading>
          <TypographyP className="mt-2 max-w-lg mx-auto">
            We'll use these labels to organize your inbox. You can change them
            later.
          </TypographyP>
        </div>

        <CategoriesSetup defaultValues={undefined} />

        <div className="flex justify-center mt-8">
          <ContinueButton
            href={prefixPath(emailAccountId, "/onboarding?step=4")}
          />
        </div>
      </OnboardingWrapper>

      <div className="bg-white h-screen items-center justify-center hidden xl:flex">
        <Image
          src="/images/assistant/labels.png"
          alt="Categorize your emails"
          width={1200}
          height={800}
          className="mx-auto rounded border-4 border-blue-50 shadow-sm ml-32"
        />
      </div>
    </div>
  );
}
