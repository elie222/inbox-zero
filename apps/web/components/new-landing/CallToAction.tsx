"use client";

import { useState } from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/new-landing/common/Button";
import { Chat } from "@/components/new-landing/icons/Chat";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";

interface CallToActionProps {
  buttonSize?: "xl" | "lg";
  className?: string;
  showSalesButton?: boolean;
  text?: string;
}

export function CallToAction({
  text = "Get started",
  buttonSize = "xl",
  className,
  showSalesButton = true,
}: CallToActionProps) {
  const posthog = usePostHog();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className={cn("flex justify-center items-center gap-4", className)}>
      <Button size={buttonSize} disabled={isLoading} asChild={!isLoading}>
        {isLoading ? (
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="relative z-10">Loading...</span>
          </div>
        ) : (
          <Link
            href="/login"
            onClick={() => {
              setIsLoading(true);
              landingPageAnalytics.getStartedClicked(posthog);
            }}
          >
            <span className="relative z-10">{text}</span>
          </Link>
        )}
      </Button>
      {showSalesButton ? (
        <Button variant="secondary-two" size={buttonSize} asChild>
          <Link
            href="/sales"
            target="_blank"
            onClick={() => landingPageAnalytics.talkToSalesClicked(posthog)}
          >
            <Chat />
            Talk to sales
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
