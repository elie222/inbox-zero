"use client";

import Link from "next/link";
import { ZapIcon } from "lucide-react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Integrations } from "@/app/(app)/[emailAccountId]/integrations/Integrations";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
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
    minimumTier: "PLUS_MONTHLY",
  });

  if (!integrationsEnabled) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-between gap-2">
          <PageHeader
            title="Integrations"
            description="Connect to external services to help the AI assistant draft better replies by accessing relevant data from your tools."
          />
        </div>

        <div className="mt-8">
          <ActionCard
            variant="blue"
            icon={<ZapIcon className="h-5 w-5" />}
            title="Integrations are not enabled"
            description="This feature is in limited rollout. Join early access to enable integrations for your account."
            action={
              <Button asChild variant="outline">
                <Link href="/early-access">Join Early Access</Link>
              </Button>
            }
          />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="flex items-center justify-between gap-2">
        <PageHeader
          title="Integrations"
          description="Connect to external services to help the AI assistant draft better replies by accessing relevant data from your tools."
        />
        {hasAccess && (
          <div className="shrink-0">
            <RequestAccessDialog
              trigger={
                <Button variant="outline">Request an Integration</Button>
              }
            />
          </div>
        )}
      </div>

      <div className="mt-8 space-y-4">
        {!hasAccess && <IntegrationsPremiumAlert />}
        <Integrations />
      </div>
    </PageWrapper>
  );
}
