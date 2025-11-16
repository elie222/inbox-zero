"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { useRecallCalendar } from "@/hooks/useRecallCalendar";
import {
  createRecallCalendarAction,
  deleteRecallCalendarAction,
} from "@/utils/actions/recall-calendar";
import { useAccount } from "@/providers/EmailAccountProvider";

export function RecallCalendarManager() {
  const { data, isLoading, error, mutate } = useRecallCalendar();
  const { emailAccountId } = useAccount();

  const handleCreateCalendar = useCallback(async () => {
    const result = await createRecallCalendarAction(emailAccountId);

    if (result?.serverError) {
      toastError({
        title: "Error creating Recall calendar",
        description: result.serverError,
      });
    } else {
      toastSuccess({ description: "Recall calendar created successfully!" });
      mutate();
    }
  }, [emailAccountId, mutate]);

  const handleDeleteCalendar = useCallback(async () => {
    const result = await deleteRecallCalendarAction(emailAccountId);

    if (result?.serverError) {
      toastError({
        title: "Error deleting Recall calendar",
        description: result.serverError,
      });
    } else {
      toastSuccess({ description: "Recall calendar deleted successfully!" });
      mutate();
    }
  }, [emailAccountId, mutate]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recall Calendar Integration</h2>
          <div className="space-x-2">
            {data?.hasRecallCalendars ? (
              <Button variant="destructive" onClick={handleDeleteCalendar}>
                Delete Recall Calendar
              </Button>
            ) : (
              <Button
                onClick={handleCreateCalendar}
                disabled={!data?.hasConnectedCalendars}
              >
                Create Recall Calendar
              </Button>
            )}
          </div>
        </div>

        {!data?.hasConnectedCalendars && (
          <div className="text-sm text-gray-600">
            You need to connect a calendar first before creating a Recall
            calendar.
          </div>
        )}

        {data?.calendars && data.calendars.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Connected Calendars:</h3>
            {data.calendars.map((calendar) => (
              <div key={calendar.connectionId} className="border p-3 rounded">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{calendar.email}</p>
                    <p className="text-sm text-gray-600 capitalize">
                      {calendar.provider} Calendar
                    </p>
                  </div>
                  <div className="text-right">
                    {calendar.isConnectedToRecall ? (
                      <div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Connected to Recall
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          Status: {calendar.recallCalendar?.status}
                        </p>
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Not connected to Recall
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </LoadingContent>
  );
}
