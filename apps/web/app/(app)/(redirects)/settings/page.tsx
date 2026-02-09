"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
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
import { MultiAccountSection } from "@/app/(app)/[emailAccountId]/settings/MultiAccountSection";
import { OrgAnalyticsConsentSection } from "@/app/(app)/[emailAccountId]/settings/OrgAnalyticsConsentSection";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { RuleImportExportSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/RuleImportExportSetting";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
      <div className="mx-auto max-w-5xl space-y-6 pt-4">
        <PageHeader
          title="Settings"
          description="Manage your account, team access, and email configurations"
        />

        <SettingsGroupCard
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
                      isActive={emailAccount.id === activeEmailAccountId}
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
                    Manage other email accounts
                  </Link>
                </Button>
              </div>
            )}
          </LoadingContent>
        </SettingsGroupCard>

        {!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS && (
          <SettingsGroupCard
            icon={<CreditCardIcon className="size-5" />}
            title="Account & Billing"
          >
            <div className="space-y-6">
              <MultiAccountSection />
              <Separator />
              <BillingSection />
            </div>
          </SettingsGroupCard>
        )}

        <SettingsGroupCard
          icon={<SettingsIcon className="size-5" />}
          title="AI Model"
          description="Configure which AI provider powers your email automation"
        >
          <ModelSection />
        </SettingsGroupCard>

        <SettingsGroupCard
          icon={<WebhookIcon className="size-5" />}
          title="Developer Settings"
        >
          <div className="space-y-6">
            <WebhookSection />
            <Separator />
            <ApiKeysSection />
          </div>
        </SettingsGroupCard>

        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-red-600" />
              <CardTitle className="text-lg text-red-600">
                Danger Zone
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent>
            <DeleteSection />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmailAccountSettingsCard({
  emailAccount,
  isActive,
  showAdvanced,
  onToggleAdvanced,
  showNotifications,
}: {
  emailAccount: GetEmailAccountsResponse["emailAccounts"][number];
  isActive: boolean;
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
            <div className="flex items-center gap-2">
              <p className="font-medium">{emailAccount.email}</p>
              {isActive ? <Badge variant="secondary">Active</Badge> : null}
            </div>
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

        <div className="space-y-4">
          <ConnectedAppsSection
            emailAccountId={emailAccount.id}
            showNotifications={showNotifications}
          />
          <Separator />
          <OrgAnalyticsConsentSection emailAccountId={emailAccount.id} />
        </div>

        {showAdvanced && (
          <>
            <Separator />
            <div className="space-y-4 pt-1">
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

function SettingsGroupCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
