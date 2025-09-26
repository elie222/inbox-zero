"use client";

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
import { useMcpConnections } from "@/hooks/useMcpConnections";

export function Integrations() {
  const { data, isLoading, error } = useMcpConnections();

  return (
    <LoadingContent loading={isLoading} error={error}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Integration</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.connections.length ? (
            data.connections.map((connection) => (
              <TableRow key={connection.id}>
                <TableCell>{connection.name}</TableCell>
                <TableCell>{connection.integration.name}</TableCell>
                <TableCell>{connection.approvedTools.join(", ")}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={3}>
                <TypographyP>No connections found</TypographyP>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </LoadingContent>
  );
}
