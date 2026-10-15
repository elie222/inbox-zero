"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ArrowRightIcon } from "lucide-react";
import { toastError } from "@/components/Toast";
import { saveSignupIntentAction } from "@/utils/actions/onboarding";
import { MAIL_CLIENT_WELCOME_PATH } from "@/utils/config";
import { getActionErrorMessage } from "@/utils/error";

export function ContinueWithEmailClient() {
  const router = useRouter();
  const { execute, isExecuting } = useAction(saveSignupIntentAction, {
    onSuccess: () => router.push(MAIL_CLIENT_WELCOME_PATH),
    onError: ({ error }) =>
      toastError({ description: getActionErrorMessage(error) }),
  });

  return (
    <button
      type="button"
      disabled={isExecuting}
      onClick={() => execute({ intent: "MAIL_CLIENT" })}
      className="mx-auto mt-4 inline-flex items-center gap-1 text-sm text-gray-500 underline-offset-4 hover:text-gray-900 hover:underline disabled:opacity-60"
    >
      Just want the email app? Continue for free
      <ArrowRightIcon className="size-3.5" />
    </button>
  );
}
