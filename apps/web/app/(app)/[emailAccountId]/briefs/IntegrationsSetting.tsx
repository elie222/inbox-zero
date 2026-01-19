"use client";

import Link from "next/link";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useIntegrationsEnabled } from "@/hooks/useFeatureFlags";

export function IntegrationsSetting() {
  const { emailAccountId } = useAccount();
  const { data } = useIntegrations();
  const integrationsEnabled = useIntegrationsEnabled();

  if (!integrationsEnabled) {
    return null;
  }

  const connectedIntegrations =
    data?.integrations.filter((i) => i.connection?.isActive && !i.comingSoon) ||
    [];

  const enabledToolsCount = connectedIntegrations.reduce(
    (count, i) =>
      count + (i.connection?.tools?.filter((t) => t.isEnabled).length || 0),
    0,
  );

  const hasConnectedIntegrations = connectedIntegrations.length > 0;

  return (
    <SettingCard
      title="Integrations"
      description={
        hasConnectedIntegrations
          ? `Connected to ${connectedIntegrations.map((i) => i.shortName || i.displayName).join(", ")} with ${enabledToolsCount} tool${enabledToolsCount === 1 ? "" : "s"} enabled`
          : "Connect to CRM, databases, and other tools to enrich briefings with more context"
      }
      right={
        <Button variant="outline" asChild>
          <Link href={`/${emailAccountId}/integrations`}>
            {hasConnectedIntegrations ? "Manage" : "Connect"}
          </Link>
        </Button>
      }
    />
  );
}
