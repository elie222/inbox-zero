"use client";

import { KeyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { regenerateWebhookSecretAction } from "@/utils/actions/webhook";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAction } from "next-safe-action/hooks";
import { getActionErrorMessage } from "@/utils/error";

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
        description: getActionErrorMessage(error.error),
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
      <KeyIcon className="mr-2 size-4" />
      {hasSecret ? "Regenerate secret" : "Generate secret"}
    </Button>
  );
}
