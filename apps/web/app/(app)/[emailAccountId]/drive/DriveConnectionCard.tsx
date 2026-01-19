"use client";

import { MoreVertical, Trash2, XCircle } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import type { GetDriveConnectionsResponse } from "@/app/api/user/drive/connections/route";
import { disconnectDriveAction } from "@/utils/actions/drive";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { toastError } from "@/components/Toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Image from "next/image";

type DriveConnection = GetDriveConnectionsResponse["connections"][0];

export function getProviderInfo(provider: string) {
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
}

export function DriveConnectionCard({
  connection,
}: {
  connection: DriveConnection;
}) {
  const { emailAccountId } = useAccount();
  const { mutate } = useDriveConnections();
  const providerInfo = getProviderInfo(connection.provider);

  const { executeAsync: executeDisconnect, isExecuting: isDisconnecting } =
    useAction(disconnectDriveAction.bind(null, emailAccountId));

  const handleDisconnect = async () => {
    if (confirm("Are you sure you want to disconnect this drive?")) {
      const result = await executeDisconnect({ connectionId: connection.id });

      if (result?.serverError) {
        toastError({
          title: "Error disconnecting drive",
          description: result.serverError,
        });
      } else {
        mutate();
      }
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Image
        src={providerInfo.icon}
        alt={providerInfo.alt}
        width={16}
        height={16}
        unoptimized
      />
      <span className="font-medium text-foreground">{providerInfo.name}</span>
      <span>·</span>
      <span>{connection.email}</span>
      {!connection.isConnected && (
        <div className="flex items-center gap-1 text-red-600">
          <XCircle className="h-3 w-3" />
          <span className="text-xs">Disconnected</span>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            aria-label="Connection options"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
