"use client";

import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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
        prefix: t`Failed to update read status setting`,
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
              <ItemTitle>
                <Trans>Read status</Trans>
              </ItemTitle>
              <ItemDescription>
                <Trans>
                  See when recipients open emails you send from the mail client.
                </Trans>
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
              <ItemTitle>
                <Trans>Read status</Trans>
              </ItemTitle>
              <ItemDescription>
                <Trans>See when recipients open emails you send.</Trans>
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={t`Toggle read status`}
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
