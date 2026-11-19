"use client";

import { useLingui } from "@lingui/react/macro";
import { KeyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { regenerateWebhookSecretAction } from "@/utils/actions/webhook";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAction } from "next-safe-action/hooks";
import { getActionErrorMessage } from "@/utils/error";

export function RegenerateSecretButton({
  hasSecret,
  mutate,
  onGenerated,
}: {
  hasSecret: boolean;
  mutate: () => void;
  onGenerated: (secret: string) => void;
}) {
  const { t } = useLingui();
  const { execute, isExecuting } = useAction(regenerateWebhookSecretAction, {
    onSuccess: ({ data }) => {
      if (!data?.webhookSecret) return;
      onGenerated(data.webhookSecret);
      toastSuccess({
        description: hasSecret
          ? t`Webhook secret regenerated. Copy it now, it will not be shown again.`
          : t`Webhook secret generated. Copy it now, it will not be shown again.`,
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
      {hasSecret ? t`Regenerate secret` : t`Generate secret`}
    </Button>
  );
}
