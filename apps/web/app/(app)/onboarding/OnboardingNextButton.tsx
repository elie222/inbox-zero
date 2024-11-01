"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";

export function OnboardingNextButton() {
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const currentStep = stepParam ? Number.parseInt(stepParam) : 1;
  const nextStep = Number.isNaN(currentStep) ? 2 : currentStep + 1;

  return (
    <div className="mt-4">
      <Button asChild>
        <Link href={`/onboarding?step=${nextStep}`} scroll={false}>
          Next
        </Link>
      </Button>
    </div>
  );
}
