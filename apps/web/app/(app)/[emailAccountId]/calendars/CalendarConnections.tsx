"use client";

import { useEffect } from "react";
import { CalendarCheckIcon, FileTextIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";
import { useCalendars } from "@/hooks/useCalendars";
import { CalendarConnectionCard } from "./CalendarConnectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { TypographyP } from "@/components/Typography";
import { toastError } from "@/components/Toast";

export function CalendarConnections() {
  useCalendarNotifications();
  const { data, isLoading, error } = useCalendars();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        {connections.length === 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Connected calendars</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="space-y-2">
                <TypographyP className="text-sm">
                  Connect your calendar to unlock:
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <CalendarCheckIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">
                    AI replies based on your real availability
                  </span>
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <FileTextIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">
                    Meeting briefs before every call
                  </span>
                </TypographyP>
              </div>

              <div className="mt-4">
                <ConnectCalendar />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
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

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (!errorParam) return;

    const errorDescription = searchParams.get("error_description");
    const errorMessages: Record<
      string,
      { title: string; description: string }
    > = {
      consent_declined: {
        title: "Calendar consent not granted",
        description:
          "Microsoft reported AADSTS65004, which means the consent screen was canceled or not completed. Please complete consent and try again.",
      },
      admin_consent_required: {
        title: "Admin consent required",
        description:
          "Your Microsoft 365 tenant requires admin approval. Ask an admin to grant consent for this app in Entra ID, then retry.",
      },
      access_denied: {
        title: "Calendar access denied",
        description:
          "Microsoft denied the request. Please try again or ask your admin to approve access.",
      },
      invalid_state: {
        title: "Invalid calendar request",
        description:
          "This calendar authorization request was invalid. Please try again.",
      },
      invalid_state_format: {
        title: "Invalid calendar request",
        description:
          "We couldn't validate the calendar authorization. Please try again.",
      },
      missing_code: {
        title: "Calendar authorization canceled",
        description:
          "We didn't receive an authorization code from Microsoft. Please retry the connection.",
      },
      connection_failed: {
        title: "Calendar connection failed",
        description:
          "We couldn't complete the calendar connection. Please try again.",
      },
      oauth_error: {
        title: "Calendar connection failed",
        description:
          "Microsoft returned an OAuth error. Please try again or contact support.",
      },
    };

    const errorMessage = errorMessages[errorParam] || {
      title: "Calendar connection failed",
      description:
        errorDescription ||
        "We couldn't complete the calendar connection. Please try again.",
    };

    toastError({
      title: errorMessage.title,
      description: errorMessage.description,
    });

    router.replace(pathname);
  }, [pathname, router, searchParams]);
}
