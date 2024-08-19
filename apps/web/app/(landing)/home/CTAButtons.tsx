"use client";

import { Button } from "@/components/Button";
import { env } from "@/env";
import { useFeatureFlagVariantKey, usePostHog } from "posthog-js/react";

const variants: Record<string, string> = {
  control: "Get Started for Free",
  "cta-get-inbox-zero": "Get Your Inbox to Zero",
};

export function CTAButtons() {
  const posthog = usePostHog();
  const variant = useFeatureFlagVariantKey(
    env.NEXT_PUBLIC_POSTHOG_HERO_AB || "",
  );

  if (variant === "cta-get-inbox-zero") return null;

  return (
    <Button
      size="2xl"
      className="mt-10"
      link={{ href: "/welcome" }}
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
