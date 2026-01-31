"use client";

import { useState } from "react";
import type { GetDriveAuthUrlResponse } from "@/app/api/google/drive/auth-url/route";
import { Notice } from "@/components/Notice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import { captureException } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useDriveConnections } from "@/hooks/useDriveConnections";

export function DriveAdvancedAccess() {
  const { emailAccountId } = useAccount();
  const { data } = useDriveConnections();
  const [isRequesting, setIsRequesting] = useState(false);

  const hasGoogleConnection =
    data?.connections?.some((connection) => connection.provider === "google") ??
    false;

  if (!hasGoogleConnection) return null;

  const handleRequestAccess = async () => {
    setIsRequesting(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/google/drive/auth-url?access=full",
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
        extra: { context: "Google Drive advanced access initiation" },
      });
      toastError({
        title: "Error requesting Google Drive access",
        description: "Please try again or contact support",
      });
      setIsRequesting(false);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Advanced access</CardTitle>
        <CardDescription>
          Grant full Google Drive access to scan existing folders and files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            This lets us discover folders you already have so you don&apos;t
            need to create new ones.
          </p>
          <Button
            onClick={handleRequestAccess}
            loading={isRequesting}
            variant="outline"
          >
            Request full access
          </Button>
        </div>
        <Notice variant="warning">
          Google will show an &quot;unverified app&quot; warning for this
          permission while we finish verification.
        </Notice>
      </CardContent>
    </Card>
  );
}
