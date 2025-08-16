"use client";

import {
  ArrowRightIcon,
  ChartBarIcon,
  ClockIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const choices = [
  {
    label: "AI Personal Assistant",
    description: "Auto labelling, pre-drafted responses, and more.",
    icon: <SparklesIcon className="size-4" />,
  },
  {
    label: "Bulk Unsubscriber",
    description: "One-click unsubscribe and archive emails you never read",
    icon: <ClockIcon className="size-4" />,
  },
  {
    label: "Cold Email Blocker",
    description: "Block unsolicited sales emails and spam",
    icon: <ShieldCheckIcon className="size-4" />,
  },
  {
    label: "Reply Zero",
    description:
      "Never forget to reply. Never miss a follow up when others don't respond.",
    icon: <ReplyIcon className="size-4" />,
  },
  {
    label: "Email Analytics",
    description: "Analyze your email activity",
    icon: <ChartBarIcon className="size-4" />,
  },
];

export function StepFeatures() {
  const [selectedChoices, setSelectedChoices] = useState<Map<string, boolean>>(
    new Map(),
  );

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle size="lg" className="mx-auto">
        <ZapIcon className="size-6" />
      </IconCircle>

      <div className="text-center mt-4">
        <PageHeading>How would you like to use Inbox Zero?</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          Select as many as you want.
        </TypographyP>

        <div className="grid sm:grid-cols-2 gap-4 mt-4 max-w-3xl mx-auto">
          {choices.map((choice) => (
            <button
              type="button"
              key={choice.label}
              className={cn(
                "rounded-xl border bg-card p-4 text-card-foreground shadow-sm text-left flex items-center gap-4 transition-all min-h-24",
                selectedChoices.get(choice.label) &&
                  "border-blue-600 ring-2 ring-blue-100",
              )}
              onClick={() => {
                setSelectedChoices((prev) =>
                  new Map(prev).set(choice.label, !prev.get(choice.label)),
                );
              }}
            >
              <IconCircle size="sm">{choice.icon}</IconCircle>

              <div>
                <div className="font-medium">{choice.label}</div>
                <div className="text-sm text-muted-foreground">
                  {choice.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        <Button type="submit" size="sm" variant="primaryBlue" className="mt-6">
          Continue <ArrowRightIcon className="size-4 ml-2" />
        </Button>
      </div>
    </OnboardingWrapper>
  );
}
