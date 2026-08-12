"use client";

import Link from "next/link";
import { ListChecksIcon, PenLineIcon, ZapIcon } from "lucide-react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Integrations } from "@/app/(app)/[emailAccountId]/integrations/Integrations";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import {
  Item,
  ItemCard,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/utils";
import { RequestAccessDialog } from "./RequestAccessDialog";
import { usePremium } from "@/hooks/usePremium";
import { hasTierAccess } from "@/utils/premium";
import { IntegrationsPremiumAlert } from "./IntegrationsPremiumAlert";
import {
  useIntegrationActionsEnabled,
  useIntegrationsEnabled,
} from "@/hooks/useFeatureFlags";

export default function IntegrationsPage() {
  const integrationsEnabled = useIntegrationsEnabled();
  const { tier, isLoading: isPremiumLoading } = usePremium();

  const hasAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: "PLUS_MONTHLY",
  });

  // The feature flag is undefined while PostHog bootstraps
  if (integrationsEnabled === undefined) return null;

  if (!integrationsEnabled) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-between gap-2">
          <PageHeader
            title="Integrations"
            description="Connect the tools you already use."
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
          description="Connect the tools you already use."
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
        {!isPremiumLoading && !hasAccess && <IntegrationsPremiumAlert />}
        <Capabilities />
        <Integrations />
      </div>
    </PageWrapper>
  );
}

function Capabilities() {
  const actionsEnabled = useIntegrationActionsEnabled();

  return (
    <ItemCard className={cn(actionsEnabled && "sm:grid sm:grid-cols-2")}>
      <Item>
        <ItemMedia>
          <PenLineIcon className="size-4 text-blue-500" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Better drafts</ItemTitle>
          <ItemDescription>
            Replies arrive knowing the sender's plan, tickets, and history.
          </ItemDescription>
        </ItemContent>
      </Item>
      {actionsEnabled && (
        <Item>
          <ItemMedia>
            <ListChecksIcon className="size-4 text-blue-500" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Rule actions</ItemTitle>
            <ItemDescription>
              Rules can write back, like adding a Todoist task.
            </ItemDescription>
          </ItemContent>
        </Item>
      )}
    </ItemCard>
  );
}
