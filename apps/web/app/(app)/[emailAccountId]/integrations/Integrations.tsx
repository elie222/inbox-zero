"use client";

import type { GetMcpRegistryResponse } from "@/app/api/mcp/registry/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Toggle } from "@/components/Toggle";
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

export function Integrations() {
  const { data, isLoading, error } = useIntegrations();

  return (
    <LoadingContent loading={isLoading} error={error}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Integration</TableHead>
            <TableHead>Actions</TableHead>
            <TableHead>Enable</TableHead>
          </TableRow>
        </TableHeader>
        <Rows integrations={data?.integrations || {}} />
      </Table>
    </LoadingContent>
  );
}

function Rows({
  integrations,
}: {
  integrations: GetMcpRegistryResponse["integrations"];
}) {
  const integrationsList = Object.entries(integrations);

  return (
    <TableBody>
      {integrationsList.length ? (
        integrationsList.map(([name, integration]) => (
          <TableRow key={integration.name}>
            <TableCell>{integration.name}</TableCell>
            <TableCell>{integration.displayName}</TableCell>
            <TableCell>{integration.description}</TableCell>
            <TableCell>
              <Toggle
                name={`integrations.${integration.name}.enabled`}
                enabled
                // enabled={integration.isActive}
                onChange={(enabled) => {
                  // handleToggle(integration.name, enabled);
                }}
              />
            </TableCell>
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell colSpan={4}>
            <TypographyP>No integrations found</TypographyP>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}
