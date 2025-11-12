"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/new-landing/common/Button";
import { Chat } from "@/components/new-landing/icons/Chat";
import { cx } from "class-variance-authority";

interface CallToActionProps {
  text?: string;
  className?: string;
  includeSalesButton?: boolean;
}

export function CallToAction({
  text = "Get started",
  className,
  includeSalesButton = true,
}: CallToActionProps) {
  const posthog = usePostHog();

  return (
    <div
      className={cx(
        "flex justify-center",
        includeSalesButton ? "items-center gap-4" : "",
        className,
      )}
    >
      <Button size="xl" asChild>
        <Link
          href="/login"
          onClick={() => {
            posthog.capture("Clicked Get Started");
          }}
        >
          <span className="relative z-10">{text}</span>
        </Link>
      </Button>
      {includeSalesButton ? (
        <Button variant="secondary-two" size="xl" asChild>
          <Link
            href="/sales"
            target="_blank"
            onClick={() => {
              posthog.capture("Clicked talk to sales");
            }}
          >
            <Chat />
            Talk to sales
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
