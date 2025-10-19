"use client";

import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { ArrowRightIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { EmailStatsCard } from "./EmailStatsCard";

interface ReadyForBriefContentProps {
  userName: string;
}

export function ReadyForBriefContent({ userName }: ReadyForBriefContentProps) {
  const router = useRouter();
  const posthog = usePostHog();

  const handleReady = async () => {
    posthog?.capture("ready_for_brief_clicked", {
      user_name: userName,
    });

    // Redirect to welcome survey page
    router.push("/welcome");
  };

  return (
    <div className="flex flex-col text-center space-y-6">
      <div className="space-y-4">
        <PageHeading>Get ready for your first Brief, {userName}!</PageHeading>
        <TypographyP className="text-lg">
          We're organizing your inbox and crafting your personalized Dossier.
        </TypographyP>
        <TypographyP className="text-base text-gray-600">
          This might take a few seconds — we'll handle everything quietly in the
          background.
        </TypographyP>
      </div>

      <div className="py-6">
        <EmailStatsCard />
      </div>

      <div className="pt-6">
        <Button
          onClick={handleReady}
          size="lg"
          className="w-full sm:w-auto px-8"
        >
          I'm ready
          <ArrowRightIcon className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
