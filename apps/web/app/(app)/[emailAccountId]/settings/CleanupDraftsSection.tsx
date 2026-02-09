"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { cleanupAIDraftsAction } from "@/utils/actions/user";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";

export function CleanupDraftsSection({
  emailAccountId: emailAccountIdProp,
}: {
  emailAccountId?: string;
} = {}) {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const emailAccountId = emailAccountIdProp ?? activeEmailAccountId;
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
          if (res.data.deleted === 0 && res.data.skippedModified === 0) {
            toastSuccess({ description: "No stale drafts found." });
          } else if (res.data.deleted === 0) {
            toastSuccess({
              description:
                "All stale drafts were edited by you, so none were removed.",
            });
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
    <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium">Clean Up AI Drafts</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Remove stale AI-generated drafts that are older than 3 days and
          haven't been edited.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <Button
          size="sm"
          variant="outline"
          loading={isExecuting}
          onClick={() => execute()}
        >
          Clean Up Drafts
        </Button>
        {result && result.deleted > 0 && result.skippedModified > 0 && (
          <p className="text-xs text-muted-foreground">
            {result.skippedModified} draft
            {result.skippedModified === 1 ? " was" : "s were"} kept because you
            edited {result.skippedModified === 1 ? "it" : "them"}
          </p>
        )}
      </div>
    </section>
  );
}
