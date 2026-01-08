"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { captureException } from "@/utils/error";
import type { GetDriveAuthUrlResponse } from "@/app/api/google/drive/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";

export function ConnectDrive() {
  const { emailAccountId } = useAccount();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/google/drive/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Google Drive connection");
      }

      const data: GetDriveAuthUrlResponse = await response.json();

      if (!data?.url) throw new Error("Invalid auth URL");

      window.location.href = data.url;
    } catch (error) {
      captureException(error, {
        extra: { context: "Google Drive OAuth initiation" },
      });
      toastError({
        title: "Error initiating Google Drive connection",
        description: "Please try again or contact support",
      });
      setIsConnectingGoogle(false);
    }
  };

  const handleConnectMicrosoft = async () => {
    setIsConnectingMicrosoft(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/outlook/drive/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate OneDrive connection");
      }

      const data: GetDriveAuthUrlResponse = await response.json();

      if (!data?.url) throw new Error("Invalid auth URL");

      window.location.href = data.url;
    } catch (error) {
      captureException(error, {
        extra: { context: "OneDrive OAuth initiation" },
      });
      toastError({
        title: "Error initiating OneDrive connection",
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
        loading={isConnectingGoogle}
        variant="outline"
        className="flex items-center gap-2 w-full md:w-auto"
      >
        <Image
          src="/images/google.svg"
          alt="Google Drive"
          width={16}
          height={16}
          unoptimized
        />
        {isConnectingGoogle ? "Connecting..." : "Add Google Drive"}
      </Button>

      <Button
        onClick={handleConnectMicrosoft}
        disabled={isConnectingGoogle || isConnectingMicrosoft}
        loading={isConnectingMicrosoft}
        variant="outline"
        className="flex items-center gap-2 w-full md:w-auto"
      >
        <Image
          src="/images/microsoft.svg"
          alt="OneDrive"
          width={16}
          height={16}
          unoptimized
        />
        {isConnectingMicrosoft ? "Connecting..." : "Add OneDrive"}
      </Button>
    </div>
  );
}
