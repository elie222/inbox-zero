"use client";

import { FormSection, FormWrapper } from "@/components/Form";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/[emailAccountId]/settings/ModelSection";
import { MultiAccountSection } from "@/app/(app)/[emailAccountId]/settings/MultiAccountSection";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsToolbar } from "@/components/TabsToolbar";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { BillingSection } from "@/app/(app)/[emailAccountId]/settings/BillingSection";
import { SectionDescription } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function SettingsPage() {
  const { emailAccount } = useAccount();

  return (
    <Tabs defaultValue="user">
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
          <MultiAccountSection />
          <BillingSection />
          <ModelSection />
          <WebhookSection />
          <ApiKeysSection />
          <DeleteSection />
        </FormWrapper>
      </TabsContent>

      <TabsContent value="email" className="content-container mb-10">
        {emailAccount && (
          <FormWrapper>
            <FormSection className="py-4">
              <SectionDescription>
                Settings for {emailAccount?.email}
              </SectionDescription>
            </FormSection>

            <ResetAnalyticsSection />

            {/* this is only used in Gmail when sending a new message. disabling for now. */}
            {/* <SignatureSectionForm signature={user.signature} /> */}
            {/* <EmailUpdatesSection
                summaryEmailFrequency={data?.summaryEmailFrequency}
                mutate={mutate}
              /> */}
          </FormWrapper>
        )}
      </TabsContent>
    </Tabs>
  );
}
