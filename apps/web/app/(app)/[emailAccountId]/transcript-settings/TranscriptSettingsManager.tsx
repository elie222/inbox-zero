"use client";

import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { toastSuccess, toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCalendars } from "@/hooks/useCalendars";
import { updateTranscriptsForAllCalendarsAction } from "@/utils/actions/transcript-settings";
import {
  createRecallCalendarAction,
  deleteRecallCalendarAction,
} from "@/utils/actions/recall-calendar";

export function TranscriptSettingsManager() {
  const { emailAccountId } = useAccount();
  const { data: calendarsData, isLoading, error, mutate } = useCalendars();

  // Import the actions directly instead of using useAction
  const executeUpdate = updateTranscriptsForAllCalendarsAction.bind(
    null,
    emailAccountId,
  );
  const executeCreateRecall = createRecallCalendarAction.bind(
    null,
    emailAccountId,
  );
  const executeDeleteRecall = deleteRecallCalendarAction.bind(
    null,
    emailAccountId,
  );

  const connectedCalendars =
    calendarsData?.connections.filter((conn) => conn.isConnected) || [];
  const recallConnection = connectedCalendars.find(
    (conn) => conn.recallCalendarId,
  );

  const handleToggleTranscripts = useCallback(
    async (enabled: boolean) => {
      if (!calendarsData) return;

      const optimisticData = {
        ...calendarsData,
        connections: calendarsData.connections.map((conn) => {
          if (conn.isConnected) {
            return {
              ...conn,
              calendars: conn.calendars.map((cal) => ({
                ...cal,
                transcriptEnabled: enabled,
              })),
            };
          }
          return conn;
        }),
      };
      mutate(optimisticData, false);

      try {
        if (enabled) {
          if (!recallConnection) {
            await executeCreateRecall();
          }
          await executeUpdate({ transcriptEnabled: true });
          toastSuccess({
            description: "Transcripts enabled successfully",
          });
        } else {
          if (recallConnection) {
            await executeDeleteRecall();
          }
          await executeUpdate({ transcriptEnabled: false });
          toastSuccess({
            description: "Transcripts disabled successfully",
          });
        }
        mutate();
      } catch (error) {
        mutate();
        toastError({
          title: "Error updating transcript settings",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [
      executeUpdate,
      executeCreateRecall,
      executeDeleteRecall,
      recallConnection,
      calendarsData,
      mutate,
    ],
  );

  if (connectedCalendars.length === 0) {
    return (
      <EnableFeatureCard
        title="Meeting Transcripts"
        description="Connect your calendar first to enable automatic transcript generation for your meetings"
        imageSrc="/images/illustrations/communication.svg"
        imageAlt="Meeting transcripts"
        buttonText="Connect Calendar"
        href={`/${emailAccountId}/calendars`}
        hideBorder
      />
    );
  }

  const enabledCalendars =
    connectedCalendars[0]?.calendars.filter((cal) => cal.isEnabled) || [];
  const transcriptEnabled = enabledCalendars[0]?.transcriptEnabled ?? false;

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Transcript Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Configure automatic transcript generation for your meetings
          </p>
        </div>

        <SettingCard
          title="Meeting Transcripts"
          description="Enable automatic transcript generation for your meetings to improve AI reply drafting"
          right={
            <Toggle
              name="transcript-enabled"
              enabled={transcriptEnabled}
              onChange={handleToggleTranscripts}
            />
          }
        />
      </div>
    </LoadingContent>
  );
}
