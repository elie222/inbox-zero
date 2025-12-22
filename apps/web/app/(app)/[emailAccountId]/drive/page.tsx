"use client";

import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnections } from "./DriveConnections";
import { FilingPreferences } from "./FilingPreferences";
import { FilingActivity } from "./FilingActivity";
import { DriveOnboarding } from "./DriveOnboarding";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { updateFilingPreferencesAction } from "@/utils/actions/drive";
import { toastError } from "@/components/Toast";
import { cn } from "@/utils";
import { Badge } from "@/components/ui/badge";

export default function DrivePage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useDriveConnections();
  const {
    data: emailAccount,
    isLoading: emailLoading,
    mutate: mutateEmail,
  } = useEmailAccountFull();

  const hasConnections = (data?.connections?.length ?? 0) > 0;
  const filingEnabled = emailAccount?.filingEnabled ?? false;

  const { execute: savePreferences, isExecuting: isSaving } = useAction(
    updateFilingPreferencesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutateEmail();
      },
      onError: (error) => {
        toastError({
          title: "Error saving preferences",
          description: error.error.serverError || "Failed to save preferences",
        });
      },
    },
  );

  const handleToggle = (checked: boolean) => {
    savePreferences({
      filingEnabled: checked,
      filingPrompt: emailAccount?.filingPrompt,
    });
  };

  return (
    <PageWrapper>
      <LoadingContent loading={isLoading || emailLoading} error={error}>
        {hasConnections ? (
          <>
            <div className="flex items-center justify-between">
              <PageHeader title="Auto-file attachments" />
              <div className="flex items-center gap-3">
                {!filingEnabled && <Badge variant="destructive">Paused</Badge>}
                <Switch
                  checked={filingEnabled}
                  onCheckedChange={handleToggle}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div
              className={cn(
                "mt-6 space-y-4 transition-opacity duration-200",
                !filingEnabled && "opacity-50 pointer-events-none",
              )}
            >
              <DriveConnections />
              <FilingPreferences />
              <FilingActivity />
            </div>
          </>
        ) : (
          <DriveOnboarding />
        )}
      </LoadingContent>
    </PageWrapper>
  );
}
