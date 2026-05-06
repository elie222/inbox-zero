"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { cleanupAIDraftsAction } from "@/utils/actions/user";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { BRAND_NAME } from "@/utils/branding";

export function CleanupDraftsSection({
  emailAccountId,
  retentionDays = 14,
}: {
  emailAccountId: string;
  retentionDays?: number;
}) {
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
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Clean Up AI Drafts</ItemTitle>
          <ItemDescription>
            {`Delete drafts ${BRAND_NAME} created for you that are older than ${retentionDays} ${retentionDays === 1 ? "day" : "days"} and still match the saved text (you edited drafts are never removed). Does not delete other drafts.`}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            loading={isExecuting}
            onClick={() => execute()}
          >
            Delete drafts
          </Button>
        </ItemActions>
      </Item>
      {result && result.deleted > 0 && result.skippedModified > 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground">
            {result.skippedModified} draft
            {result.skippedModified === 1 ? " was" : "s were"} kept because you
            edited {result.skippedModified === 1 ? "it" : "them"}
          </p>
        </div>
      )}
    </>
  );
}
