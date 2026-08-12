"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { IntegrationRow } from "@/app/(app)/[emailAccountId]/integrations/IntegrationRow";
import { Card } from "@/components/ui/card";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { findIntegration } from "@/utils/mcp/integrations";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

export function Integrations() {
  useIntegrationNotifications();
  const { data, isLoading, error, mutate } = useIntegrations();

  const integrations = data?.integrations || [];

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
            {integrations.length ? (
              integrations.map((integration) => (
                <IntegrationRow
                  key={integration.name}
                  integration={integration}
                  onConnectionChange={mutate}
                />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3}>
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

function useIntegrationNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const analytics = useProductAnalytics("integrations");

  useEffect(() => {
    const connectedParam = searchParams.get("connected");
    const pendingParam = searchParams.get("pending");
    const errorParam = searchParams.get("error");
    if (!connectedParam && !pendingParam && !errorParam) return;

    if (connectedParam) {
      const displayName =
        findIntegration(connectedParam)?.displayName || connectedParam;
      toastSuccess({
        title: "Integration connected",
        description: `Connected to ${displayName}`,
      });
      analytics.captureAction("integration_connected", {
        integration: connectedParam,
      });
    } else if (pendingParam) {
      const displayName =
        findIntegration(pendingParam)?.displayName || pendingParam;
      toastInfo({
        title: "Connection is still finishing",
        description: `We're still connecting to ${displayName}. Refresh in a moment to see the latest status.`,
      });
      analytics.captureAction("integration_connection_pending", {
        integration: pendingParam,
      });
    } else if (errorParam) {
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
    }

    router.replace(pathname);
  }, [analytics, pathname, router, searchParams]);
}
