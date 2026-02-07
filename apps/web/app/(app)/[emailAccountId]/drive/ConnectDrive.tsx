"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { captureException } from "@/utils/error";
import type { GetDriveAuthUrlResponse } from "@/app/api/google/drive/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConnectDrive() {
  const { emailAccountId } = useAccount();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
  const [googleDialogOpen, setGoogleDialogOpen] = useState(false);

  const handleConnectGoogle = async (access: "limited" | "full") => {
    setIsConnectingGoogle(true);
    try {
      const accessParam = access === "full" ? "?access=full" : "";
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
    <>
      <div className="flex gap-2 flex-wrap md:flex-nowrap">
        <Button
          onClick={() => setGoogleDialogOpen(true)}
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

      <Dialog open={googleDialogOpen} onOpenChange={setGoogleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Google Drive</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Standard</p>
                <p className="text-xs text-muted-foreground">
                  You&apos;ll need to create new folders for filing
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setGoogleDialogOpen(false);
                  handleConnectGoogle("limited");
                }}
                disabled={isConnectingGoogle}
                loading={isConnectingGoogle}
              >
                Connect
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Full access</p>
                <p className="text-xs text-muted-foreground">
                  Use your existing folders
                </p>
                <p className="mt-1 text-xs text-amber-600">
                  Google will show a warning — we&apos;re working on
                  verification
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setGoogleDialogOpen(false);
                  handleConnectGoogle("full");
                }}
                disabled={isConnectingGoogle}
                loading={isConnectingGoogle}
              >
                Connect
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
