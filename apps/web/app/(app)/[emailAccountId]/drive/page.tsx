"use client";

import { useCallback, useState } from "react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnections } from "./DriveConnections";
import { FilingPreferences } from "./FilingPreferences";
import { FilingActivity } from "./FilingActivity";
import { DriveOnboarding } from "./DriveOnboarding";
import { DriveSetup } from "./DriveSetup";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { updateFilingEnabledAction } from "@/utils/actions/drive";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Badge } from "@/components/ui/badge";

type DriveView = "onboarding" | "setup" | "settings";

export default function DrivePage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useDriveConnections();
  const {
    data: emailAccount,
    isLoading: emailLoading,
    error: emailError,
    mutate: mutateEmail,
  } = useEmailAccountFull();
  const [forceOnboarding] = useQueryState("onboarding", parseAsBoolean);
  const [forceSetup] = useQueryState("setup", parseAsBoolean);

  const hasConnections = (data?.connections?.length ?? 0) > 0;
  const filingEnabled = emailAccount?.filingEnabled ?? false;
  const [isSaving, setIsSaving] = useState(false);

  const view = getDriveView(
    hasConnections,
    filingEnabled,
    forceOnboarding,
    forceSetup,
  );

  const handleToggle = useCallback(
    async (checked: boolean) => {
      setIsSaving(true);

      try {
        const result = await updateFilingEnabledAction(emailAccountId, {
          filingEnabled: checked,
        });

        if (result?.serverError) {
          toastError({
            title: "Error saving preferences",
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: "Preferences saved" });
          mutateEmail();
        }
      } finally {
        setIsSaving(false);
      }
    },
    [emailAccountId, mutateEmail],
  );

  return (
    <PageWrapper>
      <LoadingContent
        loading={isLoading || emailLoading}
        error={error || emailError}
      >
        {view === "onboarding" && <DriveOnboarding />}
        {view === "setup" && <DriveSetup />}
        {view === "settings" && (
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
        )}
      </LoadingContent>
    </PageWrapper>
  );
}

function getDriveView(
  hasConnections: boolean,
  filingEnabled: boolean,
  forceOnboarding: boolean | null,
  forceSetup: boolean | null,
): DriveView {
  if (forceOnboarding === true || !hasConnections) return "onboarding";
  if (forceSetup === true || (hasConnections && !filingEnabled)) return "setup";
  return "settings";
}
