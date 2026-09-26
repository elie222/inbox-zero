"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import type { PIPEDREAM_APPS } from "@/utils/mcp/pipedream-apps";
import { ConnectionStatus, IntegrationNameCell } from "./IntegrationRow";
import { startMcpOAuth } from "./startMcpOAuth";

export function PipedreamAppRow({
  app,
  status,
}: {
  app: (typeof PIPEDREAM_APPS)[number];
  status: "connected" | "paused" | "disconnected";
}) {
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("integrations");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    analytics.captureAction("integration_connect_started", {
      integration: "pipedream",
      pipedream_app: app.slug,
      auth_type: "oauth",
    });
    setConnecting(true);

    try {
      await startMcpOAuth({ integrationName: "pipedream", emailAccountId });
    } catch (error) {
      analytics.captureAction("integration_connect_failed", {
        integration: "pipedream",
        pipedream_app: app.slug,
        reason: "auth_url_error",
      });
      toastError({
        title: `Error connecting to ${app.name}`,
        description:
          error instanceof Error && error.message
            ? error.message
            : "Please try again or contact support if the issue persists.",
      });
      setConnecting(false);
    }
  };

  return (
    <TableRow>
      <IntegrationNameCell
        url={app.url}
        name={app.name}
        description={app.description}
      />
      <TableCell className="whitespace-nowrap">
        {status === "disconnected" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? "Connecting..." : "Connect"}
          </Button>
        ) : (
          <ConnectionStatus isActive={status === "connected"} />
        )}
      </TableCell>
      <TableCell />
    </TableRow>
  );
}
