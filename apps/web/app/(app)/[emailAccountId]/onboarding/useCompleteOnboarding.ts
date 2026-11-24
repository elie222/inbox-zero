"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { env } from "@/env";
import { completedOnboardingAction } from "@/utils/actions/onboarding";
import {
  ASSISTANT_ONBOARDING_COOKIE,
  markOnboardingAsCompleted,
} from "@/utils/cookies";
import { captureException, getActionErrorMessage } from "@/utils/error";
import { toastError } from "@/components/Toast";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";
import { usePremium } from "@/hooks/usePremium";
import { isPremiumRecord } from "@/utils/premium";
import type { SignupIntent } from "@/generated/prisma/enums";

// Marks onboarding complete and redirects: the upgrade page for users without a
// plan, otherwise the mail app for email-app users and setup for everyone else.
export function useCompleteOnboarding(signupIntent: SignupIntent | null) {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const { isPremium, mutate: refetchPremium } = usePremium();
  const { executeAsync: completeOnboarding } = useAction(
    completedOnboardingAction,
  );

  const destination = getDestination({ signupIntent, isPremium });

  // The intent question can be the last step, so its answer is passed in
  // before the refreshed user reaches this hook.
  const completeAndRedirect = useCallback(
    async (latestIntent?: SignupIntent) => {
      let result: Awaited<ReturnType<typeof completeOnboarding>>;
      try {
        result = await completeOnboarding();
      } catch (error) {
        captureException(error, {
          extra: { context: "onboarding", step: "complete", destination },
        });
        toastError({
          description: getActionErrorMessage(
            {},
            { prefix: "There was an error finishing onboarding" },
          ),
        });
        return false;
      }
      if (result?.serverError || result?.validationErrors) {
        captureException(new Error("Failed to complete onboarding"), {
          extra: {
            context: "onboarding",
            step: "complete",
            serverError: result?.serverError,
            validationErrors: result?.validationErrors,
            destination,
          },
        });
        toastError({
          description: getActionErrorMessage(
            {
              serverError: result?.serverError,
              validationErrors: result?.validationErrors,
            },
            { prefix: "There was an error finishing onboarding" },
          ),
        });
        return false;
      }

      markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);

      // The plan may still be loading, and routing a paying user on a stale
      // "no plan" would send them to the upgrade page.
      const latestUser = await refetchPremium().catch(() => undefined);
      const latestDestination = getDestination({
        signupIntent: latestIntent ?? signupIntent,
        isPremium:
          latestUser && "premium" in latestUser
            ? isPremiumRecord(latestUser.premium)
            : isPremium,
      });

      router.push(
        latestDestination === "welcome-upgrade"
          ? "/welcome-upgrade"
          : prefixPath(emailAccountId, `/${latestDestination}`),
      );
      return true;
    },
    [
      completeOnboarding,
      destination,
      emailAccountId,
      isPremium,
      refetchPremium,
      router,
      signupIntent,
    ],
  );

  return { completeAndRedirect, destination };
}

function getDestination({
  signupIntent,
  isPremium,
}: {
  signupIntent: SignupIntent | null;
  isPremium: boolean;
}) {
  if (!isPremium) return "welcome-upgrade";
  return env.NEXT_PUBLIC_MAIL_APP_ENABLED && signupIntent === "MAIL_CLIENT"
    ? "mail"
    : "setup";
}
