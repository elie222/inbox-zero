"use client";

import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingCard } from "@/components/SettingCard";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { updateReferralSignatureAction } from "@/utils/actions/email-account";

export function ReferralSignatureSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { emailAccountId } = useAccount();

  const { execute } = useAction(
    updateReferralSignatureAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Referral signature setting updated!",
        });
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError ||
            "Failed to update referral signature setting",
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      execute({ enabled });
    },
    [execute],
  );

  return (
    <SettingCard
      title="Include referral signature"
      description="Add 'Drafted by Inbox Zero' with your referral link to emails we draft for you. Earn a month of credit for each person who signs up with your link."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="referral-signature"
            enabled={data?.includeReferralSignature ?? false}
            onChange={handleToggle}
          />
        </LoadingContent>
      }
    />
  );
}
