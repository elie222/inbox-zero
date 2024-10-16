"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";

export function OnboardingNextButton() {
  const searchParams = useSearchParams();
  const currentStep = parseInt(searchParams.get("step") || "1");

  return (
    <div className="mt-4">
      <Button asChild>
        <Link href={`/onboarding?step=${currentStep + 1}`} scroll={false}>
          Next
        </Link>
      </Button>
    </div>
  );
}
