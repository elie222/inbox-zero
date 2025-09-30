"use client";

import { useState } from "react";
import type { GetMcpRegistryResponse } from "@/app/api/mcp/registry/route";
import type { GetMcpAuthUrlResponse } from "@/app/api/mcp/[integration]/auth-url/route";
import type { GetMcpConnectionsResponse } from "@/app/api/mcp/connections/route";
import { Toggle } from "@/components/Toggle";
import { TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toastError, toastSuccess } from "@/components/Toast";
import { syncMcpToolsAction } from "@/utils/actions/mcp-tools";
import { disconnectMcpConnectionAction } from "@/utils/actions/mcp-connect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";

interface IntegrationRowProps {
  integration: GetMcpRegistryResponse["integrations"][string];
  connections: GetMcpConnectionsResponse["connections"];
  onApiTokenConnect: () => void;
  onConnectionChange: () => void;
}

export function IntegrationRow({
  integration,
  connections,
  onApiTokenConnect,
  onConnectionChange,
}: IntegrationRowProps) {
  const { emailAccountId } = useAccount();
  const [syncingTools, setSyncingTools] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [expandedTools, setExpandedTools] = useState(false);

  const connection = connections.find(
    (c) => c.integration.name === integration.name && c.isActive,
  );

  const connectionStatus = {
    connected: !!connection,
    toolsCount: connection?.tools?.filter((t) => t.isEnabled).length || 0,
    totalTools: connection?.tools?.length || 0,
    connectionId: connection?.id,
    tools: connection?.tools || [],
  };

  const handleConnect = async () => {
    if (integration.authType === "api-token") {
      onApiTokenConnect();
      return;
    }

    try {
      const response = await fetchWithAccount({
        url: `/api/mcp/${integration.name}/auth-url`,
        emailAccountId,
      });

      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const data: GetMcpAuthUrlResponse = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error(
        `Failed to initiate ${integration.name} connection:`,
        error,
      );
      toastError({
        title: `Error connecting to ${integration.name}`,
        description:
          "Please try again or contact support if the issue persists.",
      });
    }
  };

  const handleSyncTools = async () => {
    setSyncingTools(true);

    try {
      const result = await syncMcpToolsAction(emailAccountId, {
        integration: integration.name,
      });

      if (result?.serverError) {
        toastError({
          title: "Error syncing tools",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          title: "Tools synced successfully",
          description: `Synced ${result?.data?.toolsCount || 0} tools from ${integration.displayName}`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error syncing tools",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSyncingTools(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect this integration? This will remove all associated tools.",
      )
    ) {
      return;
    }

    if (!connectionStatus.connectionId) return;

    setDisconnecting(true);

    try {
      const result = await disconnectMcpConnectionAction(emailAccountId, {
        connectionId: connectionStatus.connectionId,
      });

      if (result?.serverError) {
        toastError({
          title: "Error disconnecting",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          title: "Disconnected successfully",
          description:
            result?.data?.message ||
            `Disconnected from ${integration.displayName}`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error disconnecting",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <TableRow>
      <TableCell>{integration.displayName}</TableCell>
      <TableCell>{integration.description}</TableCell>
      <TableCell>
        {integration.authType === "oauth" ||
        integration.authType === "api-token" ? (
          <div className="flex items-center gap-2">
            {connectionStatus.connected ? (
              <div className="flex items-center gap-2">
                <span className="text-green-600 text-sm">✓ Connected</span>
                <span className="text-xs text-gray-500">
                  ({connectionStatus.toolsCount}/{connectionStatus.totalTools}{" "}
                  tools)
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSyncTools}
                  loading={syncingTools}
                >
                  Sync Tools
                </Button>
                <Button
                  size="sm"
                  variant="destructiveSoft"
                  onClick={handleDisconnect}
                  loading={disconnecting}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={handleConnect}>
                {integration.authType === "api-token"
                  ? "Connect with API Key"
                  : "Connect"}
              </Button>
            )}
          </div>
        ) : (
          <TypographyP className="text-sm text-gray-500">
            No Auth Required
          </TypographyP>
        )}
      </TableCell>
      <TableCell>
        {connectionStatus.connected && connectionStatus.tools.length > 0 ? (
          <Collapsible open={expandedTools} onOpenChange={setExpandedTools}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1"
              >
                {expandedTools ? (
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
                  <div key={tool.name} className="flex items-center gap-2">
                    <span
                      className={
                        tool.isEnabled ? "text-green-600" : "text-gray-400"
                      }
                    >
                      {tool.isEnabled ? "✓" : "○"}
                    </span>
                    <span className="font-mono text-xs">{tool.name}</span>
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
}
