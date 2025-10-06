"use client";

import { LoadingContent } from "@/components/LoadingContent";
import { useCalendars } from "@/hooks/useCalendars";
import { CalendarConnectionCard } from "./CalendarConnectionCard";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { useAccount } from "@/providers/EmailAccountProvider";
import { FormSection, FormWrapper } from "@/components/Form";
import { ConnectCalendarButton } from "./ConnectCalendarButton";
import { useState } from "react";
import { toastError } from "@/components/Toast";
import type { GetCalendarAuthUrlResponse } from "@/app/api/google/calendar/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";

export function CalendarConnections() {
  const { data, isLoading, error } = useCalendars();
  const { emailAccountId } = useAccount();
  const connections = data?.connections || [];
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectCalendar = async () => {
    setIsConnecting(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/google/calendar/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate calendar connection");
      }

      const data: GetCalendarAuthUrlResponse = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error initiating calendar connection:", error);
      toastError({
        title: "Error initiating calendar connection",
        description: "Please try again or contact support",
      });
      setIsConnecting(false);
    }
  };

  return (
    <LoadingContent loading={isLoading} error={error}>
      {connections.length === 0 ? (
        <EnableFeatureCard
          title="Connect Your Calendar"
          description="Connect your Google Calendar to enable meeting transcript generation and AI-powered calendar management."
          imageSrc="/images/illustrations/communication.svg"
          imageAlt="Calendar integration"
          buttonText={
            isConnecting ? "Connecting..." : "Connect Google Calendar"
          }
          onEnable={handleConnectCalendar}
          hideBorder
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Calendar Connections</h3>
              <p className="text-sm text-muted-foreground">
                Manage your connected calendars and their settings
              </p>
            </div>
            <ConnectCalendarButton />
          </div>

          <div className="grid gap-4">
            {connections.map((connection) => (
              <CalendarConnectionCard
                key={connection.id}
                connection={connection}
              />
            ))}
          </div>
        </div>
      )}
    </LoadingContent>
  );
}
