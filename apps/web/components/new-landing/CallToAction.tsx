"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/new-landing/common/Button";
import { Chat } from "@/components/new-landing/icons/Chat";
import { LandingLink } from "@/components/new-landing/LandingLink";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";

interface CallToActionProps {
  buttonSize?: "xl" | "lg";
  className?: string;
  href?: string;
  showSalesButton?: boolean;
  text?: string;
}

export function CallToAction({
  text,
  buttonSize = "xl",
  className,
  href = "/login",
  showSalesButton = true,
}: CallToActionProps) {
  const posthog = usePostHog();
  const { t } = useLingui();

  return (
    <div className={cn("flex justify-center items-center gap-4", className)}>
      <Button size={buttonSize} asChild>
        <LandingLink
          href={href}
          onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
        >
          <span className="relative z-10">{text ?? t`Get started`}</span>
        </LandingLink>
      </Button>
      {showSalesButton ? (
        <Button variant="secondary-two" size={buttonSize} asChild>
          <Link
            href="https://www.getinboxzero.com/sales"
            onClick={() => landingPageAnalytics.talkToSalesClicked(posthog)}
          >
            <Chat />
            <Trans>Talk to sales</Trans>
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
