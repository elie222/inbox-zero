"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { completedOnboardingAction } from "@/utils/actions/onboarding";

interface PreviewBriefContentProps {
  userName: string;
}

export function PreviewBriefContent({ userName }: PreviewBriefContentProps) {
  const router = useRouter();
  const posthog = usePostHog();
  const [isLoading, setIsLoading] = useState(false);

  const handleContinue = async () => {
    setIsLoading(true);

    posthog?.capture("preview_brief_continue_clicked", {
      user_name: userName,
    });

    // Mark onboarding as complete
    await completedOnboardingAction();

    // Redirect directly to app home (skipping welcome survey and upgrade for now)
    // TODO: Re-enable welcome survey flow later: router.push("/welcome");
    router.push(env.NEXT_PUBLIC_APP_HOME_PATH);
  };

  return (
    <div className="flex flex-col space-y-6 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-blue-100 p-3">
          <SparklesIcon className="size-8 text-blue-600" />
        </div>
      </div>

      <div className="space-y-4">
        <PageHeading>Your Brief is ready, {userName}!</PageHeading>
        <TypographyP className="text-lg">
          We've organized your inbox and crafted your personalized Dossier.
        </TypographyP>
        <TypographyP className="text-base text-gray-600">
          Every morning, you'll receive a curated Brief highlighting what
          matters most, so you can focus on what's important.
        </TypographyP>
      </div>

      <div className="pt-6">
        <Button
          onClick={handleContinue}
          size="lg"
          className="w-full px-8 sm:w-auto"
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Continue"}
          {!isLoading && <ArrowRightIcon className="ml-2 size-4" />}
        </Button>
      </div>
    </div>
  );
}
