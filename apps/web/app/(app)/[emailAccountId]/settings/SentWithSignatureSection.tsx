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
import { updateSentWithSignatureAction } from "@/utils/actions/email-account";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";

const title = `Include 'Sent with ${BRAND_NAME}'`;
const description = `Add 'Sent with ${BRAND_NAME}' with your referral link after your signature on emails you send from the mail client.`;

export function SentWithSignatureSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } =
    useEmailAccountFull(emailAccountId);

  const { execute, isExecuting } = useAction(
    updateSentWithSignatureAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: `Failed to update 'Sent with ${BRAND_NAME}' setting`,
      }),
    },
  );

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (!data) return;

      mutate({ ...data, includeSentWithSignature: enabled }, false);

      execute({ enabled });
    },
    [data, execute, mutate],
  );

  if (env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE) return null;

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>{title}</ItemTitle>
              <ItemDescription>{description}</ItemDescription>
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
              <ItemTitle>{title}</ItemTitle>
              <ItemDescription>{description}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={`Toggle 'Sent with ${BRAND_NAME}'`}
                checked={data.includeSentWithSignature}
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
