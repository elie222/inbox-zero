"use client";

import { Button } from "@/components/ui/button";
import { regenerateWebhookSecretAction } from "@/utils/actions/webhook";
import { isActionError } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";

export function RegenerateSecretButton({ hasSecret }: { hasSecret: boolean }) {
  const handleRegenerateSecret = async () => {
    const result = await regenerateWebhookSecretAction();
    if (isActionError(result)) {
      toastError({ title: "Error", description: result.error });
    } else {
      toastSuccess({ description: "Webhook secret regenerated" });
    }
  };

  return (
    <Button variant="outline" type="button" onClick={handleRegenerateSecret}>
      {hasSecret ? "Regenerate Secret" : "Generate Secret"}
    </Button>
  );
}
