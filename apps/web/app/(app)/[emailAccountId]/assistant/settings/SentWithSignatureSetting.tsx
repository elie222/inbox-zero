"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { updateSentWithSignatureAction } from "@/utils/actions/email-account";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";

export function SentWithSignatureSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { emailAccountId } = useAccount();

  const { execute } = useAction(
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

  if (env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE) {
    return null;
  }

  return (
    <SettingCard
      title={`Include 'Sent with ${BRAND_NAME}'`}
      description={`Add a small 'Sent with ${BRAND_NAME}' line with your referral link to emails you send from the mail client. Earn a month of credit for each person who signs up with your link.`}
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="sent-with-signature"
            enabled={data?.includeSentWithSignature ?? false}
            onChange={handleToggle}
            disabled={isLoading}
          />
        </LoadingContent>
      }
    />
  );
}
