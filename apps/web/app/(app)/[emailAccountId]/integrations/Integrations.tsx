"use client";

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
import { IntegrationRow } from "@/app/(app)/[emailAccountId]/integrations/IntegrationRow";
import { Card } from "@/components/ui/card";

export function Integrations() {
  const { data, isLoading, error } = useIntegrations();
  const { data: connectionsData, mutate } = useMcpConnections();

  const integrationsList = Object.entries(data?.integrations || {});

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
          <TableBody>
            {integrationsList.length ? (
              integrationsList.map(([, integration]) => (
                <IntegrationRow
                  key={integration.name}
                  integration={integration}
                  connections={connectionsData?.connections || []}
                  onConnectionChange={mutate}
                />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <TypographyP>No integrations found</TypographyP>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </LoadingContent>
    </Card>
  );
}
