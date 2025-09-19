"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import type { GetCalendarAuthUrlResponse } from "@/app/api/google/calendar/auth-url/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

export function ConnectCalendarButton() {
  const { emailAccountId } = useAccount();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/google/calendar/auth-url", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          [EMAIL_ACCOUNT_HEADER]: emailAccountId,
        },
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
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
      className="flex items-center gap-2"
    >
      <Calendar className="h-4 w-4" />
      {isConnecting ? "Connecting..." : "Connect Google Calendar"}
    </Button>
  );
}
