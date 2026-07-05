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

// Marks onboarding complete and redirects to the app (or the upgrade page for
// non-premium users). Shared by the step-based and chat onboarding flows so
// completion behavior can't drift between experiment arms.
export function useCompleteOnboarding() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const { isPremium } = usePremium();
  const { executeAsync: completeOnboarding } = useAction(
    completedOnboardingAction,
  );

  const destination = isPremium ? "setup" : "welcome-upgrade";

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
      return;
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
      return;
    }

    markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);

    if (isPremium) {
      router.push(prefixPath(emailAccountId, "/setup"));
    } else {
      router.push("/welcome-upgrade");
    }
  }, [completeOnboarding, destination, emailAccountId, isPremium, router]);

  return { completeAndRedirect, destination };
}
