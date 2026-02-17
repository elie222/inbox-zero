"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  CreditCardIcon,
  MailIcon,
  SlackIcon,
  SparklesIcon,
  WebhookIcon,
} from "lucide-react";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ItemCard, ItemSeparator } from "@/components/ui/item";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { env } from "@/env";

export default function SettingsPage() {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const { data, isLoading, error } = useAccounts();
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(
    null,
  );

  useSlackNotifications(true);

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

        <SettingsGroup
          icon={<SlackIcon className="size-5" />}
          title="Messaging"
        >
          <LoadingContent loading={isLoading} error={error}>
            {emailAccounts.length > 0 && (
              <div className="space-y-4">
                {emailAccounts.map((emailAccount) => (
                  <MessagingSettingsCard
                    key={emailAccount.id}
                    emailAccount={emailAccount}
                    activeEmailAccountId={activeEmailAccountId}
                  />
                ))}
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
        <ChevronRightIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <>
          <OrgAnalyticsConsentSection emailAccountId={emailAccount.id} />
          <ToggleAllRulesSection emailAccountId={emailAccount.id} />
          <RuleImportExportSetting emailAccountId={emailAccount.id} />
          <CopyRulesSection
            emailAccountId={emailAccount.id}
            emailAccountEmail={emailAccount.email}
            allAccounts={allAccounts}
          />
          <CleanupDraftsSection emailAccountId={emailAccount.id} />
          <ResetAnalyticsSection emailAccountId={emailAccount.id} />
        </>
      )}
    </ItemCard>
  );
}

function MessagingSettingsCard({
  emailAccount,
  activeEmailAccountId,
}: {
  emailAccount: GetEmailAccountsResponse["emailAccounts"][number];
  activeEmailAccountId: string;
}) {
  const isActive = emailAccount.id === activeEmailAccountId;

  return (
    <ItemCard>
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar className="size-8 rounded-full">
          <AvatarImage
            src={emailAccount.image || ""}
            alt={emailAccount.name || emailAccount.email}
          />
          <AvatarFallback className="rounded-full text-xs">
            {emailAccount.name?.charAt(0) || emailAccount.email?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-medium">{emailAccount.email}</span>
          {isActive && (
            <span className="text-xs text-muted-foreground">
              Active account
            </span>
          )}
        </div>
      </div>
      <ConnectedAppsSection emailAccountId={emailAccount.id} />
    </ItemCard>
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
