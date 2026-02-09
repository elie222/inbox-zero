"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { updateAnalyticsConsentAction } from "@/utils/actions/organization";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { useAccount } from "@/providers/EmailAccountProvider";

export function OrgAnalyticsConsentSection({
  emailAccountId: emailAccountIdProp,
}: {
  emailAccountId?: string;
} = {}) {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const emailAccountId = emailAccountIdProp ?? activeEmailAccountId;
  const { data, isLoading, error, mutate } =
    useOrganizationMembership(emailAccountId);

  const { execute } = useAction(
    updateAnalyticsConsentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings updated!" });
      },
      onError: (error) => {
        mutate();
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update settings",
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const handleToggle = useCallback(
    (checked: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        allowOrgAdminAnalytics: checked,
      };
      mutate(optimisticData, false);
      execute({ allowOrgAdminAnalytics: checked });
    },
    [data, execute, mutate],
  );

  if (!isLoading && !data && !error) {
    return null;
  }

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium">
              Organization Analytics Access
            </h3>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Allow organization admins
              {data.organizationName ? ` from ${data.organizationName}` : ""} to
              view your personal analytics and usage statistics.
            </p>
          </div>

          <Switch
            checked={data.allowOrgAdminAnalytics}
            onCheckedChange={handleToggle}
          />
        </section>
      )}
    </LoadingContent>
  );
}
