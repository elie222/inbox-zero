"use client";

import { Button } from "@/components/Button";
import { useFeatureFlagVariantKey, usePostHog } from "posthog-js/react";

const variants: Record<string, string> = {
  control: "Get Started for Free",
  "get-to-zero": "Get Your Inbox to Zero",
  "get-inbox-zero": "Get Inbox Zero",
  "cta-save-time": "Save 2 Hours Every Day",
};

export function CTAButtons() {
  const posthog = usePostHog();
  const variant = useFeatureFlagVariantKey("cta-copy");

  return (
    <Button
      size="2xl"
      className="mt-10"
      link={{ href: "/login" }}
      onClick={() => {
        posthog.capture("Clicked Get Started");
      }}
      color="blue"
    >
      {variants[(variant as string | undefined) || "control"] ||
        variants.control}
    </Button>
  );
}
