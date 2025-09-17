"use client";

import { Button } from "@/components/Button";
import { usePostHog } from "posthog-js/react";

export function CTAButtons() {
  const posthog = usePostHog();
  return (
    <div className="flex flex-col md:flex-row justify-center mt-10 gap-2">
      <div>
        <Button
          size="2xl"
          color="blue"
          link={{ href: "/login" }}
          onClick={() => {
            posthog.capture("Clicked Get Started");
          }}
        >
          Get Started for Free
        </Button>
      </div>
      <div>
        <Button
          size="2xl"
          color="transparent"
          link={{ href: "/sales", target: "_blank" }}
          onClick={() => {
            posthog.capture("Clicked talk to sales");
          }}
        >
          Talk to sales
        </Button>
      </div>
    </div>
  );
}
