"use client";

import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Integrations } from "@/app/(app)/[emailAccountId]/integrations/Integrations";
import { Button } from "@/components/ui/button";
import { RequestAccessDialog } from "./RequestAccessDialog";
import { usePremium } from "@/components/PremiumAlert";
import { hasTierAccess } from "@/utils/premium";
import { IntegrationsPremiumAlert } from "./IntegrationsPremiumAlert";
import { useIntegrationsEnabled } from "@/hooks/useFeatureFlags";

export default function IntegrationsPage() {
  const integrationsEnabled = useIntegrationsEnabled();
  const { tier } = usePremium();

  const hasAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: "BUSINESS_PLUS_MONTHLY",
  });

  // Feature flag check - return null for client-side (notFound() is server-only)
  if (!integrationsEnabled) {
    return null;
  }

  return (
    <PageWrapper>
      <div className="flex items-center justify-between">
        <PageHeader
          title="Integrations"
          description="Connect to external services to help the AI assistant draft better replies by accessing relevant data from your tools."
        />
        {hasAccess && (
          <RequestAccessDialog
            trigger={<Button variant="outline">Request an Integration</Button>}
          />
        )}
      </div>

      <div className="mt-8 space-y-4">
        {!hasAccess && <IntegrationsPremiumAlert />}
        <Integrations />
      </div>
    </PageWrapper>
  );
}
