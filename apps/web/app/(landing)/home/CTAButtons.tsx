"use client";

import { GithubIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { usePostHog } from "posthog-js/react";

export function CTAButtons() {
  const posthog = usePostHog();

  return (
    <div className="mt-10 flex items-center justify-center gap-x-6">
      {/* <Button
        size="2xl"
        link={{ href: "/waitlist" }}
        onClick={() => {
          posthog.capture("Clicked Join Waitlist");
        }}
      >
        Join Waitlist
      </Button> */}
      <Button
        size="2xl"
        link={{ href: "/stats" }}
        onClick={() => {
          posthog.capture("Clicked Get Started");
        }}
      >
        Get Started
      </Button>
      <Button
        size="2xl"
        color="white"
        link={{ href: "/github", target: "_blank" }}
        onClick={() => {
          posthog.capture("Clicked Star on Github", {});
        }}
      >
        <GithubIcon className="mr-2 h-4 w-4" />
        Star on GitHub
      </Button>
    </div>
  );
}
