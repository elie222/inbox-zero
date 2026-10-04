"use client";

import { useState, useCallback } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/components/Toast";
import { syncFastmailAction } from "@/utils/actions/fastmail-sync";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isFastmailProvider } from "@/utils/email/provider-types";

export function FastmailSyncButton() {
  const { emailAccountId, provider } = useAccount();
  const [isLoading, setIsLoading] = useState(false);

  const handleSync = useCallback(async () => {
    if (!emailAccountId) return;

    setIsLoading(true);
    try {
      const result = await syncFastmailAction(emailAccountId);

      if (result?.serverError) {
        toastError({
          title: "Sync failed",
          description: result.serverError,
        });
      } else if (result?.data) {
        toastSuccess({
          description:
            "Mail sync queued. Pending messages will be retried automatically.",
        });
      }
    } catch (error) {
      toastError({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [emailAccountId]);

  // Only show for Fastmail accounts
  if (!isFastmailProvider(provider)) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isLoading || !emailAccountId}
    >
      <RefreshCwIcon
        className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
      />
      {isLoading ? "Syncing..." : "Check for new mail"}
    </Button>
  );
}
