"use client";

import { HardDriveIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnectionCard } from "./DriveConnectionCard";

export function DriveConnections() {
  const { data, isLoading, error } = useDriveConnections();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        {connections.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HardDriveIcon />
              </EmptyMedia>
              <EmptyTitle>No drives connected</EmptyTitle>
              <EmptyDescription>
                Connect your Google Drive or OneDrive to auto-file attachments
                from your emails.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4">
            {connections.map((connection) => (
              <DriveConnectionCard
                key={connection.id}
                connection={connection}
              />
            ))}
          </div>
        )}
      </div>
    </LoadingContent>
  );
}
