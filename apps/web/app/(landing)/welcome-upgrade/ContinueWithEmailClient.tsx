"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto mt-4 max-w-7xl px-6 lg:px-8">
      <div className="flex flex-col items-stretch justify-between gap-4 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:flex-row sm:items-center sm:p-8">
        <div className="flex items-center gap-4">
          <MailIcon className="size-6 shrink-0 text-gray-400" />
          <div>
            <h3 className="font-title text-lg leading-8 text-gray-900">
              Email app
            </h3>
            <p className="text-sm leading-6 text-gray-600">
              Just want the email app? It's free on web, desktop, and iPhone.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="w-full shrink-0 sm:w-auto"
          loading={isExecuting}
          onClick={() => execute({ intent: "MAIL_CLIENT" })}
        >
          Continue for free
        </Button>
      </div>
    </div>
  );
}
