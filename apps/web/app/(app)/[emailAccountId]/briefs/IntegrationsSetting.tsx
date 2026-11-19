"use client";

import Link from "next/link";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useIntegrationsEnabled } from "@/hooks/useFeatureFlags";

export function IntegrationsSetting() {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { data, isLoading } = useIntegrations();
  const integrationsEnabled = useIntegrationsEnabled();

  // Wait for data so we don't flash the unconnected state
  if (!integrationsEnabled || isLoading) {
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
  const connectedNames = connectedIntegrations
    .map((i) => i.shortName || i.displayName)
    .join(", ");

  return (
    <SettingCard
      title={t`Integrations`}
      description={
        hasConnectedIntegrations
          ? t`Connected to ${connectedNames} with ${plural(enabledToolsCount, {
              one: "# tool",
              other: "# tools",
            })} enabled`
          : t`Connect to CRM, databases, and other tools to enrich briefings with more context`
      }
      right={
        <Button variant="outline" asChild>
          <Link href={`/${emailAccountId}/integrations`}>
            {hasConnectedIntegrations ? (
              <Trans>Manage</Trans>
            ) : (
              <Trans>Connect</Trans>
            )}
          </Link>
        </Button>
      }
    />
  );
}
