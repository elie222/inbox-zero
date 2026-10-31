"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
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
import type { SignupIntent } from "@/generated/prisma/enums";

// Marks onboarding complete and redirects to the app: the mail app for
// email-app users, otherwise setup or the upgrade page for non-premium users.
export function useCompleteOnboarding(signupIntent: SignupIntent | null) {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const { isPremium } = usePremium();
  const { executeAsync: completeOnboarding } = useAction(
    completedOnboardingAction,
  );

  const destination = getDestination({ signupIntent, isPremium });

  const completeAndRedirect = useCallback(async () => {
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

    router.push(
      destination === "welcome-upgrade"
        ? "/welcome-upgrade"
        : prefixPath(emailAccountId, `/${destination}`),
    );
    return true;
  }, [completeOnboarding, destination, emailAccountId, router]);

  return { completeAndRedirect, destination };
}

function getDestination({
  signupIntent,
  isPremium,
}: {
  signupIntent: SignupIntent | null;
  isPremium: boolean;
}) {
  if (signupIntent === "MAIL_CLIENT") return "mail";
  return isPremium ? "setup" : "welcome-upgrade";
}
