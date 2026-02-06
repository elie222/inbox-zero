"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import { cleanupAIDraftsAction } from "@/utils/actions/user";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";

export function CleanupDraftsSection() {
  const { emailAccountId } = useAccount();
  const [result, setResult] = useState<{
    deleted: number;
    skippedModified: number;
  } | null>(null);

  const { execute, isExecuting } = useAction(
    cleanupAIDraftsAction.bind(null, emailAccountId),
    {
      onSuccess: (res) => {
        if (res.data) {
          setResult(res.data);
          if (res.data.deleted === 0) {
            toastSuccess({ description: "No stale drafts found." });
          } else {
            toastSuccess({
              description: `Cleaned up ${res.data.deleted} draft${res.data.deleted === 1 ? "" : "s"}.`,
            });
          }
        }
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  return (
    <SettingCard
      title="Clean Up AI Drafts"
      description="Remove stale AI-generated drafts that are older than 3 days and haven't been edited."
      collapseOnMobile
      right={
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            loading={isExecuting}
            onClick={() => execute()}
          >
            Clean Up Drafts
          </Button>
          {result && result.deleted > 0 && result.skippedModified > 0 && (
            <p className="text-muted-foreground text-xs">
              {result.skippedModified} draft
              {result.skippedModified === 1 ? " was" : "s were"} kept because you
              edited {result.skippedModified === 1 ? "it" : "them"}
            </p>
          )}
        </div>
      }
    />
  );
}
