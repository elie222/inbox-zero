"use client";

import { useState } from "react";
import type { GetIntegrationsResponse } from "@/app/api/mcp/integrations/route";
import type { GetMcpAuthUrlResponse } from "@/app/api/mcp/[integration]/auth-url/route";
import { Toggle } from "@/components/Toggle";
import { MutedText, TypographyP } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import clsx from "clsx";
import { toastError, toastSuccess } from "@/components/Toast";
import { DomainIcon } from "@/components/charts/DomainIcon";
import {
  disconnectMcpConnectionAction,
  toggleMcpConnectionAction,
  toggleMcpToolAction,
} from "@/utils/actions/mcp";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";
import { RequestAccessDialog } from "./RequestAccessDialog";
import { truncate } from "@/utils/string";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { redirectToSafeUrl } from "@/utils/redirect";

interface IntegrationRowProps {
  integration: GetIntegrationsResponse["integrations"][number];
  onConnectionChange: () => void;
}

export function IntegrationRow({
  integration,
  onConnectionChange,
}: IntegrationRowProps) {
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("integrations");
  const [connecting, setConnecting] = useState(false);
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
    analytics.captureAction("integration_connect_started", {
      integration: integration.name,
      auth_type: integration.authType,
    });

    if (integration.authType === "api-token") {
      analytics.captureAction("integration_connect_failed", {
        integration: integration.name,
        reason: "unsupported_auth_type",
      });
      toastError({
        title: "Error connecting to integration",
        description: "API token connections are not supported yet",
      });
      return;
    }

    setConnecting(true);

    try {
      const response = await fetchWithAccount({
        url: `/api/mcp/${integration.name}/auth-url`,
        emailAccountId,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string" ? body.error : undefined,
        );
      }

      const data: GetMcpAuthUrlResponse = await response.json();
      redirectToSafeUrl(data.url, { allowExternal: true });
    } catch (error) {
      analytics.captureAction("integration_connect_failed", {
        integration: integration.name,
        reason: "auth_url_error",
      });
      console.error(
        `Failed to initiate ${integration.name} connection:`,
        error,
      );
      toastError({
        title: `Error connecting to ${integration.displayName}`,
        description:
          error instanceof Error && error.message
            ? error.message
            : "Please try again or contact support if the issue persists.",
      });
      setConnecting(false);
    }
  };

  const handleTogglePause = async () => {
    if (!connectionId) return;

    const nextActive = !isActive;
    analytics.captureAction("integration_toggled", {
      integration: integration.name,
      enabled: nextActive,
    });

    try {
      const result = await toggleMcpConnectionAction(emailAccountId, {
        connectionId,
        isActive: nextActive,
      });

      if (result?.serverError) {
        toastError({
          title: "Error updating integration",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: `${integration.displayName} ${nextActive ? "resumed" : "paused"}`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error updating integration",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleToggleTool = async (toolId: string, isEnabled: boolean) => {
    analytics.captureAction("integration_tool_toggled", {
      integration: integration.name,
      enabled: isEnabled,
    });

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

    analytics.captureAction("integration_disconnect_started", {
      integration: integration.name,
    });
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
        analytics.captureAction("integration_disconnected", {
          integration: integration.name,
        });
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
        <TableCell className="w-full">
          <div className="flex items-center gap-3">
            <DomainIcon domain={integration.url} size={32} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span>{integration.shortName || integration.displayName}</span>
                {integration.comingSoon && (
                  <Badge variant="secondary">Coming soon</Badge>
                )}
              </div>
              <MutedText>{integration.description}</MutedText>
            </div>
          </div>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {integration.comingSoon ? (
            <RequestAccessDialog integrationName={integration.displayName} />
          ) : integration.authType === "oauth" ||
            integration.authType === "api-token" ? (
            <div className="flex items-center gap-2">
              {connected ? (
                isActive ? (
                  <span className="text-green-600 text-sm">✓ Connected</span>
                ) : (
                  <span className="text-muted-foreground text-sm">Paused</span>
                )
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting
                    ? "Connecting..."
                    : integration.authType === "api-token"
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
                {tools.length > 0 && (
                  <DropdownMenuItem
                    onClick={() => {
                      analytics.captureAction("integration_tools_expanded", {
                        integration: integration.name,
                        expanded: !expandedTools,
                        enabled_tool_count: toolsCount,
                        total_tool_count: totalTools,
                      });
                      setExpandedTools(!expandedTools);
                    }}
                  >
                    {expandedTools
                      ? "Hide tools"
                      : `Manage tools (${toolsCount} of ${totalTools} on)`}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleTogglePause}>
                  {isActive ? "Pause" : "Resume"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleConnect} disabled={connecting}>
                  {connecting ? "Reconnecting..." : "Reconnect"}
                </DropdownMenuItem>
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
  onToggleTool: (toolId: string, isEnabled: boolean) => void;
  tools: NonNullable<
    GetIntegrationsResponse["integrations"][number]["connection"]
  >["tools"];
}

function ToolsList({ tools, onToggleTool }: ToolsListProps) {
  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <TableRow>
      <TableCell colSpan={3} className="bg-muted/50">
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
                  <MutedText className="whitespace-pre-wrap">
                    {truncate(tool.description, 100)}
                  </MutedText>
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
