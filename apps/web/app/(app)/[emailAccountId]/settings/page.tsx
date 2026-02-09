"use client";

import { useSearchParams } from "next/navigation";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { BillingSection } from "@/app/(app)/[emailAccountId]/settings/BillingSection";
import { ConnectedAppsSection } from "@/app/(app)/[emailAccountId]/settings/ConnectedAppsSection";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/[emailAccountId]/settings/ModelSection";
import { MultiAccountSection } from "@/app/(app)/[emailAccountId]/settings/MultiAccountSection";
import { OrgAnalyticsConsentSection } from "@/app/(app)/[emailAccountId]/settings/OrgAnalyticsConsentSection";
import { CleanupDraftsSection } from "@/app/(app)/[emailAccountId]/settings/CleanupDraftsSection";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { RuleImportExportSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/RuleImportExportSetting";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { FormWrapper } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { TabsToolbar } from "@/components/TabsToolbar";
import { SectionDescription } from "@/components/Typography";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/providers/EmailAccountProvider";
import { env } from "@/env";

export default function SettingsPage() {
  const { emailAccount } = useAccount();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "email" ? "email" : "user";

  return (
    <div>
      <div className="content-container mb-4">
        <PageHeader title="Settings" />
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsToolbar>
          <div className="w-full overflow-x-auto">
            <TabsList>
              <TabsTrigger value="user">User</TabsTrigger>
              <TabsTrigger value="email">Email Account</TabsTrigger>
            </TabsList>
          </div>
        </TabsToolbar>

        <TabsContent value="user">
          <FormWrapper>
            {!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS && (
              <>
                <MultiAccountSection />
                <BillingSection />
              </>
            )}
            <ModelSection />
            <WebhookSection />
            <ApiKeysSection />
            <DeleteSection />
          </FormWrapper>
        </TabsContent>

        <TabsContent value="email" className="content-container mb-10">
          {emailAccount && (
            <div className="mt-4">
              <SectionDescription>
                Manage {emailAccount?.email}
              </SectionDescription>

              <div className="space-y-2 mt-4">
                <ConnectedAppsSection />
                <OrgAnalyticsConsentSection />
                <RuleImportExportSetting />
                <CleanupDraftsSection />
                <ResetAnalyticsSection />
              </div>

              {/* <EmailUpdatesSection
                summaryEmailFrequency={data?.summaryEmailFrequency}
                mutate={mutate}
              /> */}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
