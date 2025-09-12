import { useState, useCallback, useEffect } from "react";
import { checkCalendarStatusAction } from "@/utils/actions/calendar";
import { toastError } from "@/components/Toast";

type CalendarStatus = {
  isConnected: boolean;
  provider: string | null;
  hasCalendarScopes: boolean;
  accountId?: string;
};

export function useCalendar(emailAccountId: string) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await checkCalendarStatusAction(emailAccountId);

      if (result?.serverError) {
        toastError({
          title: "Error checking calendar status",
          description: result.serverError,
        });
        return;
      }

      if (result?.data) {
        setStatus(result.data);
      }
    } catch {
      toastError({
        title: "Error",
        description: "Failed to check calendar connection status",
      });
    } finally {
      setIsLoading(false);
    }
  }, [emailAccountId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return {
    status,
    isLoading,
    checkStatus,
  };
}
