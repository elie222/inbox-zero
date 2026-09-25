"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Table,
  TableRow,
  TableBody,
  TableHeader,
  TableHead,
} from "@/components/ui/table";
import { useIntegrations } from "@/hooks/useIntegrations";
import type { GetIntegrationsResponse } from "@/app/api/mcp/integrations/route";
import { IntegrationRow } from "@/app/(app)/[emailAccountId]/integrations/IntegrationRow";
import { Card } from "@/components/ui/card";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import {
  isPipedreamAppConnected,
  PIPEDREAM_APPS,
} from "@/utils/mcp/pipedream-apps";
import { PipedreamAppRow } from "./PipedreamAppRow";

export function Integrations() {
  const { data, isLoading, error, mutate } = useIntegrations();

  const integrations = data?.integrations || [];
  const builtIn = integrations.filter(
    (integration) => !integration.isCustom && integration.name !== "pipedream",
  );
  const pipedream = integrations.find(
    (integration) => integration.name === "pipedream",
  );
  const custom = integrations.filter((integration) => integration.isCustom);

  useIntegrationNotifications(data?.integrations);

  return (
    <Card>
      <LoadingContent loading={isLoading} error={error}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {builtIn.map((integration) => (
              <IntegrationRow
                key={integration.name}
                integration={integration}
                onConnectionChange={mutate}
              />
            ))}
            {pipedream && (
              <>
                {PIPEDREAM_APPS.map((app) => (
                  <PipedreamAppRow
                    key={app.slug}
                    app={app}
                    status={getPipedreamAppStatus(app.slug, pipedream)}
                  />
                ))}
                <IntegrationRow
                  integration={pipedream}
                  onConnectionChange={mutate}
                />
              </>
            )}
            {custom.map((integration) => (
              <IntegrationRow
                key={integration.name}
                integration={integration}
                onConnectionChange={mutate}
              />
            ))}
          </TableBody>
        </Table>
      </LoadingContent>
    </Card>
  );
}

function useIntegrationNotifications(
  integrations: GetIntegrationsResponse["integrations"] | undefined,
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const analytics = useProductAnalytics("integrations");

  useEffect(() => {
    const connectedParam = searchParams.get("connected");
    const pendingParam = searchParams.get("pending");
    const errorParam = searchParams.get("error");
    if (!connectedParam && !pendingParam && !errorParam) return;

    if (errorParam) {
      const errorMessages: Record<
        string,
        { title: string; description: string }
      > = {
        cancelled: {
          title: "Connection cancelled",
          description:
            "You cancelled the authorization. Connect again whenever you're ready.",
        },
        oauth_error: {
          title: "Connection failed",
          description:
            "The service returned an authorization error. Please try again.",
        },
        connection_failed: {
          title: "Connection failed",
          description:
            "We couldn't complete the connection. Please try again or contact support.",
        },
        tool_sync_failed: {
          title: "Connected, but tools unavailable",
          description:
            "We couldn't load this integration's tools. Reconnect to try again.",
        },
        forbidden: {
          title: "Connection failed",
          description:
            "This account isn't authorized to complete the connection. Please try again.",
        },
      };

      const errorMessage = errorMessages[errorParam] || {
        title: "Connection failed",
        description:
          "We couldn't complete the connection. Please try again or contact support.",
      };

      toastError(errorMessage);
      analytics.captureAction("integration_connect_failed", {
        error_code: errorParam,
      });
    } else if (!integrations) {
      // The success toasts name the integration, so they wait for the list
      return;
    } else if (connectedParam) {
      const displayName = getDisplayName(connectedParam, integrations);
      toastSuccess({
        title: "Integration connected",
        description: `Connected to ${displayName}`,
      });
      analytics.captureAction("integration_connected", {
        integration: connectedParam,
      });
    } else if (pendingParam) {
      const displayName = getDisplayName(pendingParam, integrations);
      toastInfo({
        title: "Connection is still finishing",
        description: `We're still connecting to ${displayName}. Refresh in a moment to see the latest status.`,
      });
      analytics.captureAction("integration_connection_pending", {
        integration: pendingParam,
      });
    }

    router.replace(pathname);
  }, [analytics, integrations, pathname, router, searchParams]);
}

function getDisplayName(
  name: string,
  integrations: GetIntegrationsResponse["integrations"],
) {
  return (
    integrations.find((integration) => integration.name === name)
      ?.displayName || name
  );
}

function getPipedreamAppStatus(
  appSlug: string,
  pipedream: GetIntegrationsResponse["integrations"][number],
) {
  const connection = pipedream.connection;
  const toolNames = connection?.tools.map((tool) => tool.name) ?? [];
  if (!connection || !isPipedreamAppConnected(appSlug, toolNames)) {
    return "disconnected";
  }
  return connection.isActive ? "connected" : "paused";
}
