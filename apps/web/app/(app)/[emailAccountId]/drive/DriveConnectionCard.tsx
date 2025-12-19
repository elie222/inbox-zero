"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, XCircle, FolderIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { disconnectDriveAction } from "@/utils/actions/drive";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import type { GetDriveConnectionsResponse } from "@/app/api/user/drive/connections/route";
import Image from "next/image";
import { TypographyP } from "@/components/Typography";

type DriveConnection = GetDriveConnectionsResponse["connections"][0];

interface DriveConnectionCardProps {
  connection: DriveConnection;
}

const getProviderInfo = (provider: string) => {
  const providers = {
    microsoft: {
      name: "OneDrive",
      icon: "/images/microsoft.svg",
      alt: "OneDrive",
    },
    google: {
      name: "Google Drive",
      icon: "/images/google.svg",
      alt: "Google Drive",
    },
  };

  return providers[provider as keyof typeof providers] || providers.google;
};

export function DriveConnectionCard({ connection }: DriveConnectionCardProps) {
  const { emailAccountId } = useAccount();
  const { mutate } = useDriveConnections();

  const providerInfo = getProviderInfo(connection.provider);

  const { execute: executeDisconnect, isExecuting: isDisconnecting } =
    useAction(disconnectDriveAction.bind(null, emailAccountId));

  const handleDisconnect = async () => {
    if (
      confirm(
        "Are you sure you want to disconnect this drive? This will remove all filing destinations.",
      )
    ) {
      executeDisconnect({ connectionId: connection.id });
      mutate();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src={providerInfo.icon}
              alt={providerInfo.alt}
              width={32}
              height={32}
              unoptimized
            />
            <div>
              <CardTitle className="text-lg">{providerInfo.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {connection.email}
                {!connection.isConnected && (
                  <div className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-3 w-3" />
                    <span className="text-xs">Disconnected</span>
                  </div>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructiveSoft"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              Icon={Trash2}
              loading={isDisconnecting}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <TypographyP className="text-sm">
            Configure where different document types should be filed.
          </TypographyP>

          {connection.filingDestinations &&
          connection.filingDestinations.length > 0 ? (
            <div className="space-y-2">
              {connection.filingDestinations.map((dest) => (
                <div
                  key={dest.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <FolderIcon className="h-4 w-4" />
                  <span className="font-medium">{dest.documentType}:</span>
                  <span>{dest.folderPath || dest.folderName}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No filing destinations configured yet. Set up document type to
              folder mappings to enable auto-organization.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
