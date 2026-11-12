"use client";

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { redirectToSafeUrl } from "@/utils/redirect";

export function ConnectDrive() {
  const { t } = useLingui();
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

      redirectToSafeUrl(data.url, { allowExternal: true });
    } catch (error) {
      captureException(error, {
        extra: { context: "Google Drive OAuth initiation" },
      });
      toastError({
        title: t`Error initiating Google Drive connection`,
        description: t`Please try again or contact support`,
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

      redirectToSafeUrl(data.url, { allowExternal: true });
    } catch (error) {
      captureException(error, {
        extra: { context: "OneDrive OAuth initiation" },
      });
      toastError({
        title: t`Error initiating OneDrive connection`,
        description: t`Please try again or contact support`,
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
          {isConnectingGoogle ? (
            <Trans>Connecting...</Trans>
          ) : (
            <Trans>Add Google Drive</Trans>
          )}
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
          {isConnectingMicrosoft ? (
            <Trans>Connecting...</Trans>
          ) : (
            <Trans>Add OneDrive</Trans>
          )}
        </Button>
      </div>

      <Dialog open={googleDialogOpen} onOpenChange={setGoogleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Connect Google Drive</Trans>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  <Trans>Standard</Trans>
                </p>
                <p className="text-xs text-muted-foreground">
                  <Trans>
                    You&apos;ll need to create new folders for filing
                  </Trans>
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setGoogleDialogOpen(false);
                  handleConnectGoogle("limited");
                }}
                disabled={isConnectingGoogle}
                loading={isConnectingGoogle}
              >
                <Trans>Connect</Trans>
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  <Trans>Full access</Trans>
                </p>
                <p className="text-xs text-muted-foreground">
                  <Trans>Use your existing folders</Trans>
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
                <Trans>Connect</Trans>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
