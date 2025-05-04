import { Suspense } from "react";
import { ColdEmailList } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailList";
import { ColdEmailSettings } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailSettings";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { ColdEmailRejected } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailRejected";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ColdEmailTest } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailTest";
import { TabsToolbar } from "@/components/TabsToolbar";
import { GmailProvider } from "@/providers/GmailProvider";

export default function ColdEmailBlockerPage() {
  return (
    <GmailProvider>
      <Suspense>
        <PermissionsCheck />
        <div className="content-container">
          <PremiumAlertWithData className="mt-2" />
        </div>

        <Tabs defaultValue="cold-emails">
          <TabsToolbar>
            <TabsList>
              <TabsTrigger value="cold-emails">Cold Emails</TabsTrigger>
              <TabsTrigger value="rejected">Marked Not Cold</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </TabsToolbar>

          <TabsContent value="cold-emails" className="content-container mb-10">
            <Card>
              <ColdEmailList />
            </Card>
          </TabsContent>
          <TabsContent value="rejected" className="content-container mb-10">
            <Card>
              <ColdEmailRejected />
            </Card>
          </TabsContent>

          <TabsContent value="test" className="content-container mb-10">
            <ColdEmailTest />
          </TabsContent>

          <TabsContent value="settings" className="content-container mb-10">
            <ColdEmailSettings />
          </TabsContent>
        </Tabs>
      </Suspense>
    </GmailProvider>
  );
}
