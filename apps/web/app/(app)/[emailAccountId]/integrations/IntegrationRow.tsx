"use client";

import { useState } from "react";
import type { GetIntegrationsResponse } from "@/app/api/mcp/integrations/route";
import type { GetMcpAuthUrlResponse } from "@/app/api/mcp/[integration]/auth-url/route";
import { Toggle } from "@/components/Toggle";
import { TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, MoreVertical } from "lucide-react";
import clsx from "clsx";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  disconnectMcpConnectionAction,
  toggleMcpConnectionAction,
  toggleMcpToolAction,
} from "@/utils/actions/mcp";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";
import { RequestAccessDialog } from "./RequestAccessDialog";
import { truncate } from "@/utils/string";

interface IntegrationRowProps {
  integration: GetIntegrationsResponse["integrations"][number];
  onConnectionChange: () => void;
}

export function IntegrationRow({
  integration,
  onConnectionChange,
}: IntegrationRowProps) {
  const { emailAccountId } = useAccount();
  const [disconnecting, setDisconnecting] = useState(false);
  const [expandedTools, setExpandedTools] = useState(false);

  const conn = integration.connection;

  const connected = !!conn;
  const isActive = conn?.isActive || false;
  const toolsCount = conn?.tools?.filter((t) => t.isEnabled).length || 0;
  const totalTools = conn?.tools?.length || 0;
  const connectionId = conn?.id;
  const tools = conn?.tools || [];

  const handleConnect = async () => {
    if (integration.authType === "api-token") {
      toastError({
        title: "Error connecting to integration",
        description: "API token connections are not supported yet",
      });
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

  const handleToggle = async (enabled: boolean) => {
    if (!connectionId) return;

    try {
      const result = await toggleMcpConnectionAction(emailAccountId, {
        connectionId,
        isActive: enabled,
      });

      if (result?.serverError) {
        toastError({
          title: "Error toggling connection",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: `${integration.displayName} ${enabled ? "enabled" : "disabled"}`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error toggling connection",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleToggleTool = async (toolId: string, isEnabled: boolean) => {
    try {
      const result = await toggleMcpToolAction(emailAccountId, {
        toolId,
        isEnabled,
      });

      if (result?.serverError) {
        toastError({
          title: "Error toggling tool",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Tool updated" });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error toggling tool",
        description: error instanceof Error ? error.message : "Unknown error",
      });
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

    if (!connectionId) return;

    setDisconnecting(true);

    try {
      const result = await disconnectMcpConnectionAction(emailAccountId, {
        connectionId,
      });

      if (result?.serverError) {
        toastError({
          title: "Error disconnecting",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          title: "Disconnected successfully",
          description: `Disconnected from ${integration.displayName}`,
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
    <>
      <TableRow>
        <TableCell>{integration.displayName}</TableCell>
        <TableCell>
          {integration.comingSoon ? (
            <RequestAccessDialog integrationName={integration.displayName} />
          ) : integration.authType === "oauth" ||
            integration.authType === "api-token" ? (
            <div className="flex items-center gap-2">
              {connected ? (
                <div className="flex items-center gap-2">
                  <span
                    className={
                      isActive
                        ? "text-green-600 text-sm"
                        : "text-gray-500 text-sm"
                    }
                  >
                    {isActive ? "✓ Connected" : "○ Connected (Disabled)"}
                  </span>
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
          {integration.comingSoon ? (
            <span className="text-gray-400 text-sm">Coming Soon</span>
          ) : connected && tools.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1"
              onClick={() => setExpandedTools(!expandedTools)}
            >
              {expandedTools ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {toolsCount}/{totalTools} tools
            </Button>
          ) : (
            <span className="text-gray-400 text-sm">No tools</span>
          )}
        </TableCell>
        <TableCell>
          {!integration.comingSoon && (
            <Toggle
              name={`integrations.${integration.name}.enabled`}
              enabled={isActive}
              onChange={handleToggle}
            />
          )}
        </TableCell>
        <TableCell>
          {connected && !integration.comingSoon && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Integration actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-red-600"
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      </TableRow>

      {expandedTools && tools.length > 0 && (
        <ToolsList tools={tools} onToggleTool={handleToggleTool} />
      )}
    </>
  );
}

interface ToolsListProps {
  tools: NonNullable<
    GetIntegrationsResponse["integrations"][number]["connection"]
  >["tools"];
  onToggleTool: (toolId: string, isEnabled: boolean) => void;
}

function ToolsList({ tools, onToggleTool }: ToolsListProps) {
  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <TableRow>
      <TableCell colSpan={5} className="bg-muted/50">
        <div className="space-y-3">
          {sortedTools.map((tool) => (
            <div
              key={tool.id}
              className={clsx(
                "flex items-start gap-4 p-3 rounded-lg border",
                tool.isEnabled
                  ? "bg-card border-border"
                  : "bg-muted border-muted",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={clsx(
                      "font-mono text-sm font-medium",
                      tool.isEnabled
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {tool.name}
                  </span>
                </div>
                {tool.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {truncate(tool.description, 100)}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0">
                <Toggle
                  name={`tool.${tool.id}.enabled`}
                  enabled={tool.isEnabled}
                  onChange={(enabled) => onToggleTool(tool.id, enabled)}
                />
              </div>
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
