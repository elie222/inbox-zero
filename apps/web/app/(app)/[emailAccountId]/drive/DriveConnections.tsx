"use client";

import { LoadingContent } from "@/components/LoadingContent";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnectionCard } from "./DriveConnectionCard";

export function DriveConnections() {
  const { data, isLoading, error } = useDriveConnections();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        {connections.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            <p>No drive connections found.</p>
            <p>Connect your Google Drive or OneDrive to get started.</p>
          </div>
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
