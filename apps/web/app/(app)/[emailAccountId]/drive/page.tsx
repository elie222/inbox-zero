"use client";

import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnections } from "./DriveConnections";
import { ConnectDrive } from "./ConnectDrive";
import { FilingPreferences } from "./FilingPreferences";
import { FilingActivity } from "./FilingActivity";
import { DriveOnboarding } from "./DriveOnboarding";

export default function DrivePage() {
  const { data, isLoading, error } = useDriveConnections();
  const hasConnections = (data?.connections?.length ?? 0) > 0;

  return (
    <PageWrapper>
      <LoadingContent loading={isLoading} error={error}>
        {hasConnections ? (
          <>
            <PageHeader title="Auto-file attachments" />
            <div className="mt-6 space-y-6">
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
