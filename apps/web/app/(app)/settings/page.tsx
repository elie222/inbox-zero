"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  MailIcon,
  WebhookIcon,
} from "lucide-react";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { CleanupDraftsSection } from "@/app/(app)/[emailAccountId]/settings/CleanupDraftsSection";
import { ConnectedAppsSection } from "@/app/(app)/[emailAccountId]/settings/ConnectedAppsSection";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { OrgAnalyticsConsentSection } from "@/app/(app)/[emailAccountId]/settings/OrgAnalyticsConsentSection";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { RuleImportExportSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/RuleImportExportSetting";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
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
        <PageHeader title="Settings" />

        <SettingsCard
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
        </SettingsCard>

        <SettingsCard
          icon={<WebhookIcon className="size-5" />}
          title="Developer Settings"
        >
          <div className="space-y-6">
            <WebhookSection />
            <Separator />
            <ApiKeysSection />
          </div>
        </SettingsCard>

        <SettingsCard
          variant="danger"
          icon={<AlertTriangleIcon className="size-5 text-red-600" />}
          title="Danger Zone"
        >
          <DeleteSection />
        </SettingsCard>
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

function SettingsCard({
  icon,
  title,
  description,
  variant = "default",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  variant?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(variant === "danger" && "border-red-200")}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle
            className={cn("text-lg", variant === "danger" && "text-red-600")}
          >
            {title}
          </CardTitle>
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
