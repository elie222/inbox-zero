"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  ChevronRightIcon,
  CreditCardIcon,
  MailIcon,
  MessageCircleIcon,
  PlugIcon,
  SendIcon,
  SlackIcon,
  SparklesIcon,
  WebhookIcon,
} from "lucide-react";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { ProactiveUpdatesSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/ProactiveUpdatesSetting";
import { BillingSection } from "@/app/(app)/[emailAccountId]/settings/BillingSection";
import { CleanupDraftsSection } from "@/app/(app)/[emailAccountId]/settings/CleanupDraftsSection";
import {
  ConnectedAppsSection,
  useSlackNotifications,
} from "@/app/(app)/[emailAccountId]/settings/ConnectedAppsSection";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/[emailAccountId]/settings/ModelSection";
import { OrgAnalyticsConsentSection } from "@/app/(app)/[emailAccountId]/settings/OrgAnalyticsConsentSection";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { CopyRulesSection } from "@/app/(app)/[emailAccountId]/settings/CopyRulesSection";
import { RuleImportExportSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/RuleImportExportSetting";
import { ToggleAllRulesSection } from "@/app/(app)/[emailAccountId]/settings/ToggleAllRulesSection";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Item,
  ItemCard,
  ItemContent,
  ItemSeparator,
  ItemTitle,
  ItemActions,
} from "@/components/ui/item";
import { useAccounts } from "@/hooks/useAccounts";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { env } from "@/env";

export default function SettingsPage() {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const { data, isLoading, error } = useAccounts();
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(
    null,
  );

  const handleSlackConnected = useCallback(
    (connectedEmailAccountId: string | null) => {
      setExpandedAccountId(
        connectedEmailAccountId ?? activeEmailAccountId ?? null,
      );
    },
    [activeEmailAccountId],
  );

  useSlackNotifications({
    enabled: true,
    onSlackConnected: handleSlackConnected,
  });

  const emailAccounts = useMemo(() => {
    const accounts = data?.emailAccounts ?? [];
    return [...accounts].sort((a, b) => {
      if (a.id === activeEmailAccountId) return -1;
      if (b.id === activeEmailAccountId) return 1;
      return 0;
    });
  }, [activeEmailAccountId, data?.emailAccounts]);

  return (
    <div className="content-container pb-12">
      <div className="mx-auto max-w-5xl space-y-10 pt-4">
        <PageHeader title="Settings" />

        <SettingsGroup
          icon={<MailIcon className="size-5" />}
          title="Email Accounts"
        >
          <LoadingContent loading={isLoading} error={error}>
            {emailAccounts.length > 0 && (
              <div className="space-y-4">
                {emailAccounts.map((emailAccount) => (
                  <EmailAccountSettingsCard
                    key={emailAccount.id}
                    emailAccount={emailAccount}
                    allAccounts={emailAccounts}
                    expanded={expandedAccountId === emailAccount.id}
                    onToggle={() =>
                      setExpandedAccountId((current) =>
                        current === emailAccount.id ? null : emailAccount.id,
                      )
                    }
                  />
                ))}

                <Button asChild variant="outline">
                  <Link href="/accounts">
                    <MailIcon className="mr-2 size-4" />
                    Add Account
                  </Link>
                </Button>
              </div>
            )}
          </LoadingContent>
        </SettingsGroup>

        {!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS && (
          <SettingsGroup
            icon={<CreditCardIcon className="size-5" />}
            title="Billing"
          >
            <ItemCard>
              <BillingSection />
            </ItemCard>
          </SettingsGroup>
        )}

        <SettingsGroup
          icon={<SparklesIcon className="size-5" />}
          title="AI Model"
        >
          <ItemCard className="p-4">
            <ModelSection />
          </ItemCard>
        </SettingsGroup>

        <SettingsGroup
          icon={<WebhookIcon className="size-5" />}
          title="Developer"
        >
          <ItemCard>
            <WebhookSection />
            <ItemSeparator />
            <ApiKeysSection />
          </ItemCard>
        </SettingsGroup>

        <ItemCard>
          <DeleteSection />
        </ItemCard>
      </div>
    </div>
  );
}

function EmailAccountSettingsCard({
  emailAccount,
  allAccounts,
  expanded,
  onToggle,
}: {
  emailAccount: GetEmailAccountsResponse["emailAccounts"][number];
  allAccounts: GetEmailAccountsResponse["emailAccounts"];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: channelsData } = useMessagingChannels(emailAccount.id);

  const connectedProviders =
    channelsData?.channels
      .filter((ch) => ch.isConnected)
      .map((ch) => ch.provider) ?? [];
  const hasUnconnectedProvider = channelsData?.availableProviders?.some(
    (p) => !connectedProviders.includes(p),
  );

  return (
    <ItemCard>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}
      >
        <Avatar className="size-8 rounded-full">
          <AvatarImage
            src={emailAccount.image || ""}
            alt={emailAccount.name || emailAccount.email}
          />
          <AvatarFallback className="rounded-full text-xs">
            {emailAccount.name?.charAt(0) || emailAccount.email?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 text-sm font-medium">{emailAccount.email}</span>
        {connectedProviders.map((provider) => (
          <Badge
            key={provider}
            variant="secondary"
            className="gap-1 text-xs font-normal"
          >
            <ProviderIcon provider={provider} className="size-3" />
            {PROVIDER_LABELS[provider] ?? provider}
          </Badge>
        ))}
        {hasUnconnectedProvider && (
          <Badge
            variant="outline"
            className="gap-1 text-xs font-normal cursor-pointer hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              if (!expanded) onToggle();
            }}
          >
            <PlugIcon className="size-3" />
            Connect Apps
          </Badge>
        )}
        <ChevronRightIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <>
          <ConnectedAppsSection emailAccountId={emailAccount.id} />
          <div className="px-4 py-3">
            <ProactiveUpdatesSetting emailAccountId={emailAccount.id} />
          </div>
          <AdvancedSettingsSection
            emailAccountId={emailAccount.id}
            emailAccountEmail={emailAccount.email}
            allAccounts={allAccounts}
          />
        </>
      )}
    </ItemCard>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  SLACK: "Slack",
  TEAMS: "Teams",
  TELEGRAM: "Telegram",
};

function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  switch (provider) {
    case "SLACK":
      return <SlackIcon className={className} />;
    case "TEAMS":
      return <MessageCircleIcon className={className} />;
    case "TELEGRAM":
      return <SendIcon className={className} />;
    default:
      return <PlugIcon className={className} />;
  }
}

function AdvancedSettingsSection({
  emailAccountId,
  emailAccountEmail,
  allAccounts,
}: {
  emailAccountId: string;
  emailAccountEmail: string;
  allAccounts: GetEmailAccountsResponse["emailAccounts"];
}) {
  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Advanced</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Advanced Settings</DialogTitle>
              </DialogHeader>
              <ItemCard className="[&>[data-slot=item-separator]:first-child]:hidden">
                <OrgAnalyticsConsentSection emailAccountId={emailAccountId} />
                <ToggleAllRulesSection emailAccountId={emailAccountId} />
                <RuleImportExportSetting emailAccountId={emailAccountId} />
                <CopyRulesSection
                  emailAccountId={emailAccountId}
                  emailAccountEmail={emailAccountEmail}
                  allAccounts={allAccounts}
                />
                <CleanupDraftsSection emailAccountId={emailAccountId} />
                <ResetAnalyticsSection emailAccountId={emailAccountId} />
              </ItemCard>
            </DialogContent>
          </Dialog>
        </ItemActions>
      </Item>
    </>
  );
}

function SettingsGroup({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      {title && (
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <h2 className="text-sm font-medium uppercase tracking-wide">
            {title}
          </h2>
        </div>
      )}
      {children}
    </section>
  );
}
