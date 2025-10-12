"use client";

import {
  Building2,
  Users,
  Building,
  Factory,
  Landmark,
  User,
} from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { useCallback } from "react";
import { saveOnboardingAnswersAction } from "@/utils/actions/onboarding";
import { toastError } from "@/components/Toast";
import { OnboardingButton } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingButton";

const COMPANY_SIZES = [
  {
    value: 1,
    label: "Only me",
    icon: <User className="size-4" />,
  },
  {
    value: 5,
    label: "2-10 people",
    icon: <Users className="size-4" />,
  },
  {
    value: 50,
    label: "11-100 people",
    icon: <Building className="size-4" />,
  },
  {
    value: 500,
    label: "101-1000 people",
    icon: <Factory className="size-4" />,
  },
  {
    value: 1000,
    label: "1000+ people",
    icon: <Landmark className="size-4" />,
  },
];

export function StepCompanySize({ onNext }: { onNext: () => void }) {
  const onSelectCompanySize = useCallback(
    async (companySize: number) => {
      try {
        await saveOnboardingAnswersAction({
          surveyId: "onboarding",
          questions: [{ key: "company_size", type: "single_choice" }],
          answers: { $survey_response: companySize },
        });

        onNext();
      } catch (error) {
        console.error("Failed to save company size:", error);
        toastError({
          description:
            "There was an error saving your selection. Please try again.",
        });
      }
    },
    [onNext],
  );

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle size="lg" className="mx-auto">
        <Building2 className="size-6" />
      </IconCircle>

      <div className="text-center mt-4">
        <PageHeading>What's the size of your company?</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          This helps us tailor the experience to your organization's needs.
        </TypographyP>
      </div>

      <div className="mt-6 grid gap-3">
        {COMPANY_SIZES.map((size) => (
          <OnboardingButton
            key={size.value}
            text={size.label}
            icon={size.icon}
            onClick={() => onSelectCompanySize(size.value)}
          />
        ))}
      </div>
    </OnboardingWrapper>
  );
}
