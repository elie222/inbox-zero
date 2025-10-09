"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import type { GetCalendarAuthUrlResponse } from "@/app/api/google/calendar/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";
import Image from "next/image";

export function ConnectCalendar() {
  const { emailAccountId } = useAccount();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/google/calendar/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Google calendar connection");
      }

      const data: GetCalendarAuthUrlResponse = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error initiating Google calendar connection:", error);
      toastError({
        title: "Error initiating Google calendar connection",
        description: "Please try again or contact support",
      });
      setIsConnectingGoogle(false);
    }
  };

  const handleConnectMicrosoft = async () => {
    setIsConnectingMicrosoft(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/outlook/calendar/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Microsoft calendar connection");
      }

      const data: GetCalendarAuthUrlResponse = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error initiating Microsoft calendar connection:", error);
      toastError({
        title: "Error initiating Microsoft calendar connection",
        description: "Please try again or contact support",
      });
      setIsConnectingMicrosoft(false);
    }
  };

  return (
    <div className="flex gap-2 flex-wrap md:flex-nowrap">
      <Button
        onClick={handleConnectGoogle}
        disabled={isConnectingGoogle || isConnectingMicrosoft}
        variant="outline"
        className="flex items-center gap-2 w-full md:w-auto"
      >
        <Image
          src="/images/google.svg"
          alt="Google"
          width={16}
          height={16}
          unoptimized
        />
        {isConnectingGoogle ? "Connecting..." : "Add Google Calendar"}
      </Button>

      <Button
        onClick={handleConnectMicrosoft}
        disabled={isConnectingGoogle || isConnectingMicrosoft}
        variant="outline"
        className="flex items-center gap-2 w-full md:w-auto"
      >
        <Image
          src="/images/microsoft.svg"
          alt="Microsoft"
          width={16}
          height={16}
          unoptimized
        />
        {isConnectingMicrosoft ? "Connecting..." : "Add Outlook Calendar"}
      </Button>
    </div>
  );
}
