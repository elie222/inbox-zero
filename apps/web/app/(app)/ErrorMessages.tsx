"use client";

import Link from "next/link";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { clearUserErrorMessagesAction } from "@/utils/actions/error-messages";
import type { GetErrorMessagesResponse } from "@/app/api/user/error-messages/route";

export function ErrorMessages() {
  const { data: errorMessages, mutate } = useSWR<GetErrorMessagesResponse>(
    "/api/user/error-messages",
  );
  const { execute: clearErrorMessages, isExecuting } = useAction(
    clearUserErrorMessagesAction,
    {
      onSuccess: () => mutate(),
      onError: ({ error }) =>
        toastError({ description: getActionErrorMessage(error) }),
    },
  );

  if (!errorMessages || Object.keys(errorMessages).length === 0) return null;

  const errors = Object.values(errorMessages);
  const hasMultipleErrors = errors.length > 1;
  const singleError = errors.length === 1 ? errors[0] : null;

  return (
    <AppAlertBanner
      title="Action Required"
      description={
        <ul className="list-none space-y-1">
          {errors.map((error) => (
            <li key={error.message}>
              {error.message}
              {hasMultipleErrors && error.actionUrl ? (
                <Link className="ml-2 underline" href={error.actionUrl}>
                  {error.actionLabel || "Fix this"}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      }
      action={
        <div className="flex items-center gap-2">
          {singleError?.actionUrl ? (
            <Button asChild variant="red" size="sm">
              <Link href={singleError.actionUrl}>
                {singleError.actionLabel || "Fix this"}
              </Link>
            </Button>
          ) : null}
          <Button
            variant={singleError?.actionUrl ? "ghost" : "red"}
            size="sm"
            loading={isExecuting}
            onClick={() => clearErrorMessages()}
          >
            I've fixed them
          </Button>
        </div>
      }
    />
  );
}
