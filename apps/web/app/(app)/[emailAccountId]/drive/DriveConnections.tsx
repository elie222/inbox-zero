"use client";

import { LoadingContent } from "@/components/LoadingContent";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnectionCard } from "./DriveConnectionCard";

export function DriveConnections() {
  const { data, isLoading, error } = useDriveConnections();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      {connections.length > 0 && (
        <div>
          {connections.map((connection) => (
            <DriveConnectionCard key={connection.id} connection={connection} />
          ))}
        </div>
      )}
    </LoadingContent>
  );
}
