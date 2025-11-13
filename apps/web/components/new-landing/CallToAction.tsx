"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/new-landing/common/Button";
import { Chat } from "@/components/new-landing/icons/Chat";
import { cx } from "class-variance-authority";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

interface CallToActionProps {
  text?: string;
  className?: string;
  includeSalesButton?: boolean;
}

export function CallToAction({
  text = "Get started",
  className,
}: CallToActionProps) {
  const posthog = usePostHog();

  return (
    <div className={cx("flex justify-center items-center gap-4", className)}>
      <Button size="xl" asChild>
        <Link
          href="/login"
          onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
        >
          <span className="relative z-10">{text}</span>
        </Link>
      </Button>
      <Button variant="secondary-two" size="xl" asChild>
        <Link
          href="/sales"
          target="_blank"
          onClick={() => landingPageAnalytics.talkToSalesClicked(posthog)}
        >
          <Chat />
          Talk to sales
        </Link>
      </Button>
    </div>
  );
}
