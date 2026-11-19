"use client";

import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CalendarCheckIcon, FileTextIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";
import { useCalendars } from "@/hooks/useCalendars";
import { CalendarConnectionCard } from "./CalendarConnectionCard";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { TypographyP } from "@/components/Typography";
import { toastError } from "@/components/Toast";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

export function CalendarConnections() {
  useCalendarNotifications();
  const { data, isLoading, error } = useCalendars();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        {connections.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <TypographyP className="text-sm">
                  <Trans>Connect your calendar to unlock:</Trans>
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <CalendarCheckIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">
                    <Trans>AI replies based on your real availability</Trans>
                  </span>
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <FileTextIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">
                    <Trans>Meeting briefs before every call</Trans>
                  </span>
                </TypographyP>
              </div>

              <div className="mt-4">
                <ConnectCalendar />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 max-sm:grid-cols-1">
            <ConnectCalendar />

            {connections.map((connection) => (
              <CalendarConnectionCard
                key={connection.id}
                connection={connection}
              />
            ))}
          </div>
        )}
      </div>
    </LoadingContent>
  );
}

function useCalendarNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const analytics = useProductAnalytics("calendars");
  const { t } = useLingui();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (!errorParam) return;

    const errorDescription = searchParams.get("error_description");
    const errorMessages: Record<
      string,
      { title: string; description: string }
    > = {
      consent_declined: {
        title: t`Calendar consent not granted`,
        description: t`Microsoft reported AADSTS65004, which means the consent screen was canceled or not completed. Please complete consent and try again.`,
      },
      admin_consent_required: {
        title: t`Admin consent required`,
        description: t`Your Microsoft 365 tenant requires admin approval. Ask an admin to grant consent for this app in Entra ID, then retry.`,
      },
      access_denied: {
        title: t`Calendar access denied`,
        description: t`Microsoft denied the request. Please try again or ask your admin to approve access.`,
      },
      invalid_state: {
        title: t`Invalid calendar request`,
        description: t`This calendar authorization request was invalid. Please try again.`,
      },
      invalid_state_format: {
        title: t`Invalid calendar request`,
        description: t`We couldn't validate the calendar authorization. Please try again.`,
      },
      missing_code: {
        title: t`Calendar authorization canceled`,
        description: t`We didn't receive an authorization code from Microsoft. Please retry the connection.`,
      },
      connection_failed: {
        title: t`Calendar connection failed`,
        description: t`We couldn't complete the calendar connection. Please try again.`,
      },
      oauth_error: {
        title: t`Calendar connection failed`,
        description: t`Microsoft returned an OAuth error. Please try again or contact support.`,
      },
    };

    const errorMessage = errorMessages[errorParam] || {
      title: t`Calendar connection failed`,
      description:
        errorDescription ||
        t`We couldn't complete the calendar connection. Please try again.`,
    };

    toastError({
      title: errorMessage.title,
      description: errorMessage.description,
    });
    analytics.captureAction("calendar_connect_failed", {
      error_code: errorParam,
    });

    router.replace(pathname);
  }, [analytics, pathname, router, searchParams, t]);
}
