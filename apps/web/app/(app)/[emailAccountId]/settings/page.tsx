"use client";

import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { BillingSection } from "@/app/(app)/[emailAccountId]/settings/BillingSection";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/[emailAccountId]/settings/ModelSection";
import { MultiAccountSection } from "@/app/(app)/[emailAccountId]/settings/MultiAccountSection";
import { ResetAnalyticsSection } from "@/app/(app)/[emailAccountId]/settings/ResetAnalyticsSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import { FormSection, FormWrapper } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { TabsToolbar } from "@/components/TabsToolbar";
import { SectionDescription } from "@/components/Typography";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useAccount } from "@/providers/EmailAccountProvider";
import { env } from "@/env";

export default function SettingsPage() {
  const { emailAccount } = useAccount();

  return (
    <div className="h-full overflow-y-auto">
      <div className="content-container mb-6">
        <PageHeader title="Settings" />
      </div>

      <Tabs defaultValue="user">
        <TabsToolbar>
          <div className="w-full overflow-x-auto">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="user">User Settings</TabsTrigger>
              <TabsTrigger value="email">Email Account</TabsTrigger>
            </TabsList>
          </div>
        </TabsToolbar>

        <TabsContent value="user" className="mt-6">
          <div className="content-container">
            <Card className="border-none bg-card/50 shadow-sm">
              <CardContent className="p-0">
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="email" className="content-container mt-6 mb-10">
          {emailAccount && (
            <Card className="border-none bg-card/50 shadow-sm">
              <CardContent className="p-0">
                <FormWrapper>
                  <FormSection className="py-6">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <SectionDescription className="text-foreground font-medium">
                        {emailAccount?.email}
                      </SectionDescription>
                    </div>
                  </FormSection>

                  <ResetAnalyticsSection />
                </FormWrapper>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
