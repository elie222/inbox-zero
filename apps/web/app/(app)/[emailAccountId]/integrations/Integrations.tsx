"use client";

import { useState } from "react";
import type { GetMcpRegistryResponse } from "@/app/api/mcp/registry/route";
import type { GetMcpAuthUrlResponse } from "@/app/api/mcp/[integration]/auth-url/route";
import type { GetMcpConnectionsResponse } from "@/app/api/mcp/connections/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Toggle } from "@/components/Toggle";
import { TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableRow,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useMcpConnections } from "@/hooks/useMcpConnections";
import { toastError, toastSuccess } from "@/components/Toast";
import { syncMcpToolsAction } from "@/utils/actions/mcp-tools";
import { useAccount } from "@/providers/EmailAccountProvider";
import { McpAgentTest } from "./McpAgentTest";
import { fetchWithAccount } from "@/utils/fetch";

export function Integrations() {
  const { data, isLoading, error } = useIntegrations();
  const { data: connectionsData } = useMcpConnections();

  return (
    <LoadingContent loading={isLoading} error={error}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Connection</TableHead>
            <TableHead>Tools</TableHead>
            <TableHead>Enable</TableHead>
          </TableRow>
        </TableHeader>
        <Rows
          integrations={data?.integrations || {}}
          connections={connectionsData?.connections || []}
        />
      </Table>

      <McpAgentTest />
    </LoadingContent>
  );
}

function Rows({
  integrations,
  connections,
}: {
  integrations: GetMcpRegistryResponse["integrations"];
  connections: GetMcpConnectionsResponse["connections"];
}) {
  const integrationsList = Object.entries(integrations);
  const [syncingTools, setSyncingTools] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<string | null>(null);
  const { emailAccountId } = useAccount();

  const getConnectionStatus = (integrationName: string) => {
    const connection = connections.find(
      (c) => c.integration.name === integrationName && c.isActive,
    );

    return {
      connected: !!connection,
      isLoading: false,
      toolsCount: connection?.tools?.filter((t) => t.isEnabled).length || 0,
      totalTools: connection?.tools?.length || 0,
      connectionName: connection?.name,
      tools: connection?.tools || [],
    };
  };

  const handleConnect = async (integrationName: string) => {
    try {
      const response = await fetchWithAccount({
        url: `/api/mcp/${integrationName}/auth-url`,
        emailAccountId,
      });

      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const data: GetMcpAuthUrlResponse = await response.json();

      // Redirect to OAuth flow
      window.location.href = data.url;
    } catch (error) {
      console.error(`Failed to initiate ${integrationName} connection:`, error);
      toastError({
        title: `Error connecting to ${integrationName}`,
        description:
          "Please try again or contact support if the issue persists.",
      });
    }
  };

  const handleSyncTools = async (integrationName: string) => {
    setSyncingTools(integrationName);

    try {
      const result = await syncMcpToolsAction(emailAccountId, {
        integration: integrationName,
      });

      if (result?.serverError) {
        toastError({
          title: "Error syncing tools",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          title: "Tools synced successfully",
          description: `Synced ${result?.data?.toolsCount || 0} tools from ${integrationName}`,
        });
      }
    } catch (error) {
      toastError({
        title: "Error syncing tools",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSyncingTools(null);
    }
  };

  return (
    <TableBody>
      {integrationsList.length ? (
        integrationsList.map(([, integration]) => {
          const connectionStatus = getConnectionStatus(integration.name);

          return (
            <TableRow key={integration.name}>
              <TableCell>{integration.displayName}</TableCell>
              <TableCell>{integration.description}</TableCell>
              <TableCell>
                {integration.authType === "oauth" ? (
                  <div className="flex items-center gap-2">
                    {connectionStatus.connected ? (
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 text-sm">
                          ✓ Connected
                        </span>
                        <span className="text-xs text-gray-500">
                          ({connectionStatus.toolsCount}/
                          {connectionStatus.totalTools} tools)
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSyncTools(integration.name)}
                          disabled={syncingTools === integration.name}
                        >
                          {syncingTools === integration.name
                            ? "Syncing..."
                            : "Sync Tools"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnect(integration.name)}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                ) : (
                  <TypographyP className="text-sm text-gray-500">
                    {integration.authType === "api-token"
                      ? "API Token Required"
                      : "No Auth Required"}
                  </TypographyP>
                )}
              </TableCell>
              <TableCell>
                {connectionStatus.connected &&
                connectionStatus.tools.length > 0 ? (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        {expandedTools === integration.name ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {connectionStatus.toolsCount} tools
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="space-y-1 text-sm">
                        {connectionStatus.tools.map((tool) => (
                          <div
                            key={tool.name}
                            className="flex items-center gap-2"
                          >
                            <span
                              className={
                                tool.isEnabled
                                  ? "text-green-600"
                                  : "text-gray-400"
                              }
                            >
                              {tool.isEnabled ? "✓" : "○"}
                            </span>
                            <span className="font-mono text-xs">
                              {tool.name}
                            </span>
                            {tool.description && (
                              <span className="text-gray-500 truncate max-w-xs">
                                {tool.description.slice(0, 50)}...
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <span className="text-gray-400 text-sm">No tools</span>
                )}
              </TableCell>
              <TableCell>
                <Toggle
                  name={`integrations.${integration.name}.enabled`}
                  enabled={connectionStatus.connected}
                  onChange={(_enabled) => {
                    // handleToggle(integration.name, enabled);
                  }}
                />
              </TableCell>
            </TableRow>
          );
        })
      ) : (
        <TableRow>
          <TableCell colSpan={6}>
            <TypographyP>No integrations found</TypographyP>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}
