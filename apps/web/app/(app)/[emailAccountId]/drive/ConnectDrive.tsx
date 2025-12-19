"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import type { GetDriveAuthUrlResponse } from "@/app/api/google/drive/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";
import { createScopedLogger } from "@/utils/logger";
import Image from "next/image";

export function ConnectDrive() {
  const { emailAccountId } = useAccount();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
  const logger = createScopedLogger("drive-connection");

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
      window.location.href = data.url;
    } catch (error) {
      logger.error("Error initiating Google Drive connection", {
        error,
        emailAccountId,
        provider: "google",
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
      window.location.href = data.url;
    } catch (error) {
      logger.error("Error initiating OneDrive connection", {
        error,
        emailAccountId,
        provider: "microsoft",
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
