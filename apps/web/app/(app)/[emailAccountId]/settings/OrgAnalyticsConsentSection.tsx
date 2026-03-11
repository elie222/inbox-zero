"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { toastSuccess, toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { updateAnalyticsConsentAction } from "@/utils/actions/organization";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";

export function OrgAnalyticsConsentSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } =
    useOrganizationMembership(emailAccountId);

  const { execute, isExecuting } = useAction(
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

  if (!isLoading && !error && !data?.organizationId) {
    return null;
  }

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.organizationId && (
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Organization Analytics</ItemTitle>
              <ItemDescription>
                {`Allow organization admins${data.organizationName ? ` from ${data.organizationName}` : ""} to view your usage`}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                checked={data.allowOrgAdminAnalytics}
                onCheckedChange={handleToggle}
                disabled={isExecuting}
              />
            </ItemActions>
          </Item>
        </>
      )}
    </LoadingContent>
  );
}
