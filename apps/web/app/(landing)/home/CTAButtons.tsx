"use client";

import { Button } from "@/components/Button";
import { usePostHog } from "posthog-js/react";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

export function CTAButtons() {
  const posthog = usePostHog();
  return (
    <div className="flex flex-col md:flex-row justify-center mt-10 gap-2">
      <div>
        <Button
          size="2xl"
          color="blue"
          link={{ href: "/login" }}
          onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
        >
          Get Started for Free
        </Button>
      </div>
      <div>
        <Button
          size="2xl"
          color="transparent"
          link={{ href: "/sales", target: "_blank" }}
          onClick={() => landingPageAnalytics.talkToSalesClicked(posthog)}
        >
          Talk to sales
        </Button>
      </div>
    </div>
  );
}
