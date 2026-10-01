"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { updateSentMessageOpenTrackingAction } from "@/utils/actions/email-account";

export function SentMessageOpenTrackingSetting({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } =
    useEmailAccountFull(emailAccountId);

  const { execute, isExecuting } = useAction(
    updateSentMessageOpenTrackingAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "Failed to update read status setting",
      }),
    },
  );

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (!data) return;

      mutate({ ...data, sentMessageOpenTrackingEnabled: enabled }, false);

      execute({ enabled });
    },
    [data, execute, mutate],
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Read status</ItemTitle>
              <ItemDescription>
                See when recipients open emails you send from the mail client.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Skeleton className="h-5 w-9 rounded-full" />
            </ItemActions>
          </Item>
        </>
      }
    >
      {data && (
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Read status</ItemTitle>
              <ItemDescription>
                See when recipients open emails you send from the mail client.
                Some apps block this, so an unopened status is not a guarantee.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label="Toggle read status"
                checked={data.sentMessageOpenTrackingEnabled}
                disabled={isExecuting}
                onCheckedChange={handleToggle}
              />
            </ItemActions>
          </Item>
        </>
      )}
    </LoadingContent>
  );
}
