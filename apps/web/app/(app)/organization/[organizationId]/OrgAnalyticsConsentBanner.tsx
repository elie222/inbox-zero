"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { ShieldCheckIcon } from "lucide-react";
import { AlertWithButton } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { updateAnalyticsConsentAction } from "@/utils/actions/organization";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { useAccount } from "@/providers/EmailAccountProvider";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

export function OrgAnalyticsConsentBanner() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, mutate } = useOrganizationMembership();

  const { execute, isPending } = useAction(
    updateAnalyticsConsentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Analytics access granted to admins!" });
        mutate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update settings",
          }),
        });
      },
    },
  );

  const handleAllow = useCallback(() => {
    execute({ allowOrgAdminAnalytics: true });
  }, [execute]);

  const isAdmin = hasOrganizationAdminRole(data?.role ?? "");

  if (
    isLoading ||
    !data?.organizationId ||
    data.allowOrgAdminAnalytics ||
    isAdmin
  ) {
    return null;
  }

  return (
    <AlertWithButton
      variant="blue"
      icon={<ShieldCheckIcon className="h-4 w-4" />}
      title="Allow organization admins to view your analytics"
      description="Your email analytics are currently private. Enable access to let organization admins view your inbox statistics and usage data. This helps your team understand productivity and collaborate more effectively."
      button={
        <Button onClick={handleAllow} loading={isPending}>
          Allow Access
        </Button>
      }
    />
  );
}
