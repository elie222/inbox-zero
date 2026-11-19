"use client";

import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { GetIntegrationsResponse } from "@/app/api/mcp/integrations/route";
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
  removeCustomMcpServerAction,
  testMcpConnectionAction,
  toggleMcpConnectionAction,
  toggleMcpToolAction,
} from "@/utils/actions/mcp";
import { useAccount } from "@/providers/EmailAccountProvider";
import { RequestAccessDialog } from "./RequestAccessDialog";
import { startMcpOAuth } from "./startMcpOAuth";
import { INTEGRATION_DESCRIPTION_MESSAGES } from "./integration-messages";
import { truncate } from "@/utils/string";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { getActionErrorMessage } from "@/utils/error";

interface IntegrationRowProps {
  integration: GetIntegrationsResponse["integrations"][number];
  onConnectionChange: () => void;
}

export function IntegrationRow({
  integration,
  onConnectionChange,
}: IntegrationRowProps) {
  const { t, i18n } = useLingui();
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("integrations");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedTools, setExpandedTools] = useState(false);

  const isCustom = integration.isCustom;
  const conn = integration.connection;

  const connected = !!conn;
  const isActive = conn?.isActive || false;
  const toolsCount = conn?.tools?.filter((tool) => tool.isEnabled).length || 0;
  const totalTools = conn?.tools?.length || 0;
  const connectionId = conn?.id;
  const tools = conn?.tools || [];
  const descriptionMessage = isCustom
    ? undefined
    : INTEGRATION_DESCRIPTION_MESSAGES[integration.name];
  const manageToolsLabel = t`${plural(toolsCount, {
    one: `Manage tools (# of ${totalTools} on)`,
    other: `Manage tools (# of ${totalTools} on)`,
  })}`;
  const description = descriptionMessage
    ? i18n._(descriptionMessage)
    : integration.description;

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
        title: t`Error connecting to integration`,
        description: t`API token connections are not supported yet`,
      });
      return;
    }

    setConnecting(true);

    try {
      await startMcpOAuth({
        integrationName: integration.name,
        emailAccountId,
      });
    } catch (error) {
      analytics.captureAction("integration_connect_failed", {
        integration: integration.name,
        reason: "auth_url_error",
        error_message:
          error instanceof Error && error.message ? error.message : undefined,
      });
      console.error(
        `Failed to initiate ${integration.name} connection:`,
        error,
      );
      toastError({
        title: t`Error connecting to ${integration.displayName}`,
        description:
          error instanceof Error && error.message
            ? error.message
            : t`Please try again or contact support if the issue persists.`,
      });
      setConnecting(false);
    }
  };

  const handleToggleToolsExpanded = () => {
    analytics.captureAction("integration_tools_expanded", {
      integration: integration.name,
      expanded: !expandedTools,
      enabled_tool_count: toolsCount,
      total_tool_count: totalTools,
    });
    setExpandedTools(!expandedTools);
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
          title: t`Error updating integration`,
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: nextActive
            ? t`${integration.displayName} resumed`
            : t`${integration.displayName} paused`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: t`Error updating integration`,
        description: error instanceof Error ? error.message : t`Unknown error`,
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
          title: t`Error toggling tool`,
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: t`Tool updated` });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: t`Error toggling tool`,
        description: error instanceof Error ? error.message : t`Unknown error`,
      });
    }
  };

  const handleTestConnection = async () => {
    if (!connectionId) return;

    setTesting(true);

    try {
      const result = await testMcpConnectionAction(emailAccountId, {
        connectionId,
      });

      if (result?.data) {
        const { toolsCount } = result.data;
        toastSuccess({
          description: t`Connected. ${plural(toolsCount, { one: "# tool available.", other: "# tools available." })}`,
        });
      } else {
        toastError({
          title: t`Could not connect to ${integration.displayName}`,
          description: getActionErrorMessage(result),
        });
      }
      onConnectionChange();
    } catch (error) {
      toastError({
        title: t`Could not connect to ${integration.displayName}`,
        description: error instanceof Error ? error.message : t`Unknown error`,
      });
    } finally {
      setTesting(false);
      setMenuOpen(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmMessage = isCustom
      ? t`Are you sure you want to remove this server? This permanently deletes its connection, credentials, and tools.`
      : t`Are you sure you want to disconnect this integration? This will remove all associated tools.`;

    if (!confirm(confirmMessage)) return;

    if (!isCustom && !connectionId) return;

    analytics.captureAction("integration_disconnect_started", {
      integration: integration.name,
    });
    setDisconnecting(true);

    try {
      const result = isCustom
        ? await removeCustomMcpServerAction(emailAccountId, {
            name: integration.name,
          })
        : await disconnectMcpConnectionAction(emailAccountId, {
            connectionId: connectionId!,
          });

      if (result?.serverError) {
        toastError({
          title: t`Error disconnecting`,
          description: result.serverError,
        });
      } else {
        analytics.captureAction("integration_disconnected", {
          integration: integration.name,
        });
        toastSuccess({
          title: isCustom ? t`Server removed` : t`Disconnected successfully`,
          description: isCustom
            ? t`Removed ${integration.displayName}`
            : t`Disconnected from ${integration.displayName}`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: t`Error disconnecting`,
        description: error instanceof Error ? error.message : t`Unknown error`,
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
                  <Badge variant="secondary">
                    <Trans>Coming soon</Trans>
                  </Badge>
                )}
                {isCustom && (
                  <Badge variant="secondary">
                    <Trans>Custom</Trans>
                  </Badge>
                )}
              </div>
              {description && <MutedText>{description}</MutedText>}
            </div>
          </div>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {integration.comingSoon ? (
            <RequestAccessDialog integrationName={integration.displayName} />
          ) : connected || integration.authType !== "none" ? (
            <div className="flex items-center gap-2">
              {connected ? (
                isActive ? (
                  <span className="text-green-600 text-sm">
                    <Trans>✓ Connected</Trans>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    <Trans>Paused</Trans>
                  </span>
                )
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting
                    ? t`Connecting...`
                    : integration.authType === "api-token"
                      ? t`Connect with API Key`
                      : t`Connect`}
                </Button>
              )}
            </div>
          ) : (
            <TypographyP className="text-sm text-gray-500">
              <Trans>No Auth Required</Trans>
            </TypographyP>
          )}
        </TableCell>
        <TableCell>
          {(connected || isCustom) && !integration.comingSoon && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={t`Integration actions`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {connected && (
                  <>
                    {tools.length > 0 && (
                      <DropdownMenuItem onClick={handleToggleToolsExpanded}>
                        {expandedTools ? t`Hide tools` : manageToolsLabel}
                      </DropdownMenuItem>
                    )}
                    {isActive && (
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          handleTestConnection();
                        }}
                        disabled={testing}
                      >
                        {testing ? t`Testing...` : t`Test connection`}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleTogglePause}>
                      {isActive ? t`Pause` : t`Resume`}
                    </DropdownMenuItem>
                    {integration.authType === "oauth" && (
                      <DropdownMenuItem
                        onClick={handleConnect}
                        disabled={connecting}
                      >
                        {connecting ? t`Reconnecting...` : t`Reconnect`}
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                <DropdownMenuItem
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-red-600"
                >
                  {i18n._(getDisconnectLabel({ isCustom, disconnecting }))}
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

function getDisconnectLabel({
  isCustom,
  disconnecting,
}: {
  isCustom: boolean;
  disconnecting: boolean;
}) {
  if (isCustom) return disconnecting ? msg`Removing...` : msg`Remove`;
  return disconnecting ? msg`Disconnecting...` : msg`Disconnect`;
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
