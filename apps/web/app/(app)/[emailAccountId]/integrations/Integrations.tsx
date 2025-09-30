"use client";

import { useState } from "react";
import type { GetMcpRegistryResponse } from "@/app/api/mcp/registry/route";
import type { GetMcpConnectionsResponse } from "@/app/api/mcp/connections/route";
import { LoadingContent } from "@/components/LoadingContent";
import { TypographyP } from "@/components/Typography";
import {
  Table,
  TableRow,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
} from "@/components/ui/table";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useMcpConnections } from "@/hooks/useMcpConnections";
import { ConnectApiTokenModal } from "./ConnectApiTokenModal";
import { IntegrationRow } from "@/app/(app)/[emailAccountId]/integrations/IntegrationRow";
import { Card } from "@/components/ui/card";

export function Integrations() {
  const { data, isLoading, error } = useIntegrations();
  const { data: connectionsData, mutate } = useMcpConnections();

  return (
    <Card>
      <LoadingContent loading={isLoading} error={error}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead>Tools</TableHead>
              <TableHead>Enable</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <Rows
            integrations={data?.integrations || {}}
            connections={connectionsData?.connections || []}
            onConnectionChange={mutate}
          />
        </Table>
      </LoadingContent>
    </Card>
  );
}

function Rows({
  integrations,
  connections,
  onConnectionChange,
}: {
  integrations: GetMcpRegistryResponse["integrations"];
  connections: GetMcpConnectionsResponse["connections"];
  onConnectionChange: () => void;
}) {
  const integrationsList = Object.entries(integrations);
  const [apiTokenModalOpen, setApiTokenModalOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<
    GetMcpRegistryResponse["integrations"][string] | null
  >(null);

  const handleApiTokenConnect = (
    integration: GetMcpRegistryResponse["integrations"][string],
  ) => {
    setSelectedIntegration(integration);
    setApiTokenModalOpen(true);
  };

  return (
    <TableBody>
      {integrationsList.length ? (
        integrationsList.map(([, integration]) => (
          <IntegrationRow
            key={integration.name}
            integration={integration}
            connections={connections}
            onApiTokenConnect={() => handleApiTokenConnect(integration)}
            onConnectionChange={onConnectionChange}
          />
        ))
      ) : (
        <TableRow>
          <TableCell colSpan={6}>
            <TypographyP>No integrations found</TypographyP>
          </TableCell>
        </TableRow>
      )}

      {selectedIntegration && (
        <ConnectApiTokenModal
          open={apiTokenModalOpen}
          onOpenChange={setApiTokenModalOpen}
          integration={selectedIntegration}
          onSuccess={onConnectionChange}
        />
      )}
    </TableBody>
  );
}
