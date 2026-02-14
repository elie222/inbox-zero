"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  CreditCardIcon,
  MailIcon,
  SettingsIcon,
  WebhookIcon,
} from "lucide-react";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { BillingSection } from "@/app/(app)/[emailAccountId]/settings/BillingSection";
import { CleanupDraftsSection } from "@/app/(app)/[emailAccountId]/settings/CleanupDraftsSection";
import { ConnectedAppsSection } from "@/app/(app)/[emailAccountId]/settings/ConnectedAppsSection";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/[emailAccountId]/settings/ModelSection";
import { OrgAnalyticsConsentSection } from "@/app/(app)/[emailAccountId]/settings/OrgAnalyticsConsentSection";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { RuleImportExportSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/RuleImportExportSetting";
import { ToggleAllRulesSection } from "@/app/(app)/[emailAccountId]/settings/ToggleAllRulesSection";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ItemCard, ItemSeparator } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { env } from "@/env";

export default function SettingsPage() {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const { data, isLoading, error } = useAccounts();
  const [showAdvancedByAccount, setShowAdvancedByAccount] = useState<
    Record<string, boolean>
  >({});

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
                {emailAccounts.map((emailAccount, index) => {
                  const showAdvanced = !!showAdvancedByAccount[emailAccount.id];

                  return (
                    <EmailAccountSettingsCard
                      key={emailAccount.id}
                      emailAccount={emailAccount}
                      showAdvanced={showAdvanced}
                      onToggleAdvanced={() =>
                        setShowAdvancedByAccount((current) => ({
                          ...current,
                          [emailAccount.id]: !current[emailAccount.id],
                        }))
                      }
                      showNotifications={index === 0}
                    />
                  );
                })}

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
            <ItemCard className="p-4">
              <BillingSection />
            </ItemCard>
          </SettingsGroup>
        )}

        <SettingsGroup
          icon={<SettingsIcon className="size-5" />}
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
  showAdvanced,
  onToggleAdvanced,
  showNotifications,
}: {
  emailAccount: GetEmailAccountsResponse["emailAccounts"][number];
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  showNotifications: boolean;
}) {
  return (
    <Card className="border bg-background">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 rounded-full">
              <AvatarImage
                src={emailAccount.image || ""}
                alt={emailAccount.name || emailAccount.email}
              />
              <AvatarFallback className="rounded-full">
                {emailAccount.name?.charAt(0) || emailAccount.email?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <p className="font-medium">{emailAccount.email}</p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={onToggleAdvanced}
          >
            {showAdvanced ? "Hide Advanced" : "Show Advanced"}
            <ChevronRightIcon
              className={cn(
                "ml-1 size-4 transition-transform",
                showAdvanced && "rotate-90",
              )}
            />
          </Button>
        </div>

        <ConnectedAppsSection
          emailAccountId={emailAccount.id}
          showNotifications={showNotifications}
        />
        <OrgAnalyticsConsentSection emailAccountId={emailAccount.id} />

        {showAdvanced && (
          <>
            <Separator />
            <div className="space-y-4 pt-1">
              <ToggleAllRulesSection emailAccountId={emailAccount.id} />
              <RuleImportExportSetting emailAccountId={emailAccount.id} />
              <Separator />
              <CleanupDraftsSection emailAccountId={emailAccount.id} />
              <Separator />
              <ResetAnalyticsSection emailAccountId={emailAccount.id} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
    <section className="space-y-3">
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
