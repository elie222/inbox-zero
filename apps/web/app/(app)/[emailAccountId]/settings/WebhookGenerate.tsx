"use client";

import { Button } from "@/components/ui/button";
import { regenerateWebhookSecretAction } from "@/utils/actions/webhook";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAction } from "next-safe-action/hooks";

export function RegenerateSecretButton({
  hasSecret,
  mutate,
}: {
  hasSecret: boolean;
  mutate: () => void;
}) {
  const { execute, isExecuting } = useAction(regenerateWebhookSecretAction, {
    onSuccess: () => {
      toastSuccess({
        description: "Webhook secret regenerated",
      });
    },
    onError: (error) => {
      toastError({
        description:
          error.error.serverError ??
          "An unknown error occurred while regenerating the webhook secret",
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      loading={isExecuting}
      onClick={() => execute()}
    >
      {hasSecret ? "Regenerate Secret" : "Generate Secret"}
    </Button>
  );
}
