"use client";

import { FormWrapper } from "@/components/Form";
import { AboutSectionForm } from "@/app/(app)/[emailAccountId]/settings/AboutSectionForm";
// import { SignatureSectionForm } from "@/app/(app)/settings/SignatureSectionForm";
// import { LabelsSection } from "@/app/(app)/settings/LabelsSection";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/[emailAccountId]/settings/ModelSection";
import { EmailUpdatesSection } from "@/app/(app)/[emailAccountId]/settings/EmailUpdatesSection";
import { MultiAccountSection } from "@/app/(app)/[emailAccountId]/settings/MultiAccountSection";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsToolbar } from "@/components/TabsToolbar";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { LoadingContent } from "@/components/LoadingContent";
import { DigestMailFrequencySection } from "@/app/(app)/[emailAccountId]/settings/DigestMailFrequencySection";
import { useDigestEnabled } from "@/hooks/useFeatureFlags";
import { BillingSection } from "@/app/(app)/[emailAccountId]/settings/BillingSection";

export default function SettingsPage(_props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const digestEnabled = useDigestEnabled();

  return (
    <Tabs defaultValue="email">
      <TabsToolbar>
        <div className="w-full overflow-x-auto">
          <TabsList>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="user">User</TabsTrigger>
          </TabsList>
        </div>
      </TabsToolbar>

      <TabsContent value="email" className="content-container mb-10">
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <FormWrapper>
              <AboutSectionForm about={data?.about} mutate={mutate} />
              {/* this is only used in Gmail when sending a new message. disabling for now. */}
              {/* <SignatureSectionForm signature={user.signature} /> */}
              {/* <LabelsSection /> */}
              {/* <EmailUpdatesSection
                summaryEmailFrequency={data?.summaryEmailFrequency}
                mutate={mutate}
              /> */}
              {digestEnabled && (
                <DigestMailFrequencySection
                  digestSchedule={data?.digestSchedule ?? undefined}
                  mutate={mutate}
                />
              )}
              <ResetAnalyticsSection />
            </FormWrapper>
          )}
        </LoadingContent>
      </TabsContent>
      <TabsContent value="user">
        <FormWrapper>
          <ModelSection />
          <MultiAccountSection />
          <WebhookSection />
          <ApiKeysSection />
          <BillingSection />
          <DeleteSection />
        </FormWrapper>
      </TabsContent>
    </Tabs>
  );
}
