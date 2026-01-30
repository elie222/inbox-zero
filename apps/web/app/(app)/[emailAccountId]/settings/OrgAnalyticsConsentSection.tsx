"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { SettingCard } from "@/components/SettingCard";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { updateAnalyticsConsentAction } from "@/utils/actions/organization";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { useAccount } from "@/providers/EmailAccountProvider";

export function OrgAnalyticsConsentSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useOrganizationMembership();

  const { execute, isPending } = useAction(
    updateAnalyticsConsentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings updated!" });
        mutate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update settings",
          }),
        });
        mutate();
      },
    },
  );

  const handleToggle = useCallback(
    (checked: boolean) => {
      execute({ allowOrgAdminAnalytics: checked });
    },
    [execute],
  );

  if (!isLoading && !data && !error) {
    return null;
  }

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <SettingCard
          title="Organization Analytics Access"
          description={`Allow organization admins${data.organizationName ? ` from ${data.organizationName}` : ""} to view your personal analytics and usage statistics.`}
          right={
            <Switch
              checked={data.allowOrgAdminAnalytics}
              onCheckedChange={handleToggle}
              disabled={isPending}
            />
          }
        />
      )}
    </LoadingContent>
  );
}
