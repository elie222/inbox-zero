"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { captureException } from "@/utils/error";
import type { GetDriveAuthUrlResponse } from "@/app/api/google/drive/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/Notice";

export function ConnectDrive() {
  const { emailAccountId } = useAccount();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
  const [requestFullAccess, setRequestFullAccess] = useState(false);
  const fullAccessId = useId();

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      const accessParam = requestFullAccess ? "?access=full" : "";
      const response = await fetchWithAccount({
        url: `/api/google/drive/auth-url${accessParam}`,
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
    <div className="space-y-3">
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

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor={fullAccessId}>
              Full Google Drive access (advanced)
            </Label>
            <p className="text-xs text-muted-foreground">
              Lets us scan existing folders so you don&apos;t need to create new
              ones.
            </p>
          </div>
          <Switch
            id={fullAccessId}
            checked={requestFullAccess}
            onCheckedChange={setRequestFullAccess}
          />
        </div>
        {requestFullAccess && (
          <Notice variant="warning" className="mt-3">
            Google will show an &quot;unverified app&quot; warning for this
            permission while we finish verification.
          </Notice>
        )}
      </div>
    </div>
  );
}
