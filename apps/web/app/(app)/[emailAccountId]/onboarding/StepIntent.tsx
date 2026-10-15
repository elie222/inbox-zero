"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { InboxIcon, Layers, SparklesIcon } from "lucide-react";
import { PageHeading } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { toastError } from "@/components/Toast";
import { saveSignupIntentAction } from "@/utils/actions/onboarding";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { BRAND_NAME } from "@/utils/branding";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { SignupIntent } from "@/generated/prisma/enums";

const options: {
  intent: SignupIntent;
  title: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    intent: "AI_ASSISTANT",
    title: "AI assistant",
    hint: "In Gmail or Outlook",
    icon: <SparklesIcon className="size-5" />,
  },
  {
    intent: "MAIL_CLIENT",
    title: "Email app",
    hint: "Free",
    icon: <InboxIcon className="size-5" />,
  },
  {
    intent: "BOTH",
    title: "Both",
    hint: "Client with AI",
    icon: <Layers className="size-5" />,
  },
];

export function StepIntent() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const [selected, setSelected] = useState<SignupIntent | null>(null);

  const { execute, isExecuting } = useAction(saveSignupIntentAction, {
    onSuccess: ({ input }) => {
      if (input.intent === "MAIL_CLIENT") {
        router.push(prefixPath(emailAccountId, "/mail"));
      } else {
        // The onboarding page re-renders with the saved intent and continues
        // into the AI setup flow.
        router.refresh();
      }
    },
    onError: ({ error }) => {
      setSelected(null);
      toastError({ description: getActionErrorMessage(error) });
    },
  });

  return (
    <OnboardingWrapper className="py-0">
      <PageHeading className="text-center">
        How do you want to use {BRAND_NAME}?
      </PageHeading>

      <div className="mx-auto mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.intent}
            type="button"
            disabled={isExecuting}
            className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-6 text-card-foreground shadow-sm transition-all hover:border-blue-600 hover:ring-2 hover:ring-blue-100 disabled:opacity-60 data-[selected=true]:border-blue-600 data-[selected=true]:ring-2 data-[selected=true]:ring-blue-100"
            data-selected={selected === option.intent}
            onClick={() => {
              setSelected(option.intent);
              execute({ intent: option.intent });
            }}
          >
            <IconCircle size="md">{option.icon}</IconCircle>
            <div className="text-center">
              <div className="font-medium">{option.title}</div>
              <div className="text-sm text-muted-foreground">{option.hint}</div>
            </div>
          </button>
        ))}
      </div>
    </OnboardingWrapper>
  );
}
