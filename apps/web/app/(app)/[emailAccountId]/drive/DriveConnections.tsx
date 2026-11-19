"use client";

import { Trans } from "@lingui/react/macro";
import { LoadingContent } from "@/components/LoadingContent";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnectionCard } from "./DriveConnectionCard";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function DriveConnections() {
  const { data, isLoading, error } = useDriveConnections();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      {connections.length > 0 ? (
        <div>
          {connections.map((connection) => (
            <DriveConnectionCard key={connection.id} connection={connection} />
          ))}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              <Trans>No drive connections found</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>
                Connect your drive to start organizing your documents.
              </Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </LoadingContent>
  );
}
