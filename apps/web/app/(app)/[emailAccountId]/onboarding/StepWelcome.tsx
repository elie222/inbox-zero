"use client";

import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  MailIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react";
import { MutedText, PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import type { OnboardingFlowVariant } from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import { BRAND_NAME } from "@/utils/branding";

const fastFlowHighlights = [
  {
    title: "Learn your workflow",
    description: "Tell us your role and team size.",
    icon: SparklesIcon,
  },
  {
    title: "Set up inbox organization",
    description: "Choose how labels and categories should behave.",
    icon: Settings2Icon,
  },
  {
    title: "Preview the result",
    description: "See your inbox processed before you commit further.",
    icon: MailIcon,
  },
];

export function StepWelcome({
  flowVariant,
  onNext,
}: {
  flowVariant: OnboardingFlowVariant;
  onNext: () => void;
}) {
  const isFastFlow = flowVariant === "fast-5";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-4 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <IconCircle size="lg">
              <MailIcon className="size-6" />
            </IconCircle>
          </motion.div>
        </div>

        <PageHeading className="mb-3">
          {isFastFlow ? "Let's set up your inbox" : `Welcome to ${BRAND_NAME}`}
        </PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          {isFastFlow
            ? `This takes about a minute. We'll configure the basics and show you an inbox preview.`
            : `Here's a quick look at what ${BRAND_NAME} can do for you.`}
        </TypographyP>

        {isFastFlow && (
          <div className="mb-8 grid gap-3 w-full text-left">
            {fastFlowHighlights.map((highlight) => {
              const Icon = highlight.icon;

              return (
                <div
                  key={highlight.title}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <IconCircle size="sm">
                    <Icon className="size-4" />
                  </IconCircle>
                  <div>
                    <div className="font-medium text-slate-900">
                      {highlight.title}
                    </div>
                    <MutedText>{highlight.description}</MutedText>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button className="w-full" onClick={onNext}>
            {isFastFlow ? "Start setup" : "Continue"}
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
