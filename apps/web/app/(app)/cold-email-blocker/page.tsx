import { Suspense } from "react";
import { ColdEmailList } from "@/app/(app)/cold-email-blocker/ColdEmailList";
import { ColdEmailSettings } from "@/app/(app)/cold-email-blocker/ColdEmailSettings";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PremiumAlertWithData } from "@/components/PremiumAlert";

export default function ColdEmailBlockerPage() {
  return (
    <Suspense>
      <div className="content-container mt-2">
        <PremiumAlertWithData />
      </div>

      <Tabs defaultValue="cold-emails">
        <div className="content-container flex shrink-0 flex-col items-center justify-between gap-x-4 space-y-2 border-b border-gray-200 bg-white py-2 shadow-sm md:flex-row md:gap-x-6 md:space-y-0">
          <TabsList>
            <TabsTrigger value="cold-emails">Cold Emails</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cold-emails" className="content-container mb-10">
          <Card>
            <ColdEmailList />
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="content-container mb-10">
          <ColdEmailSettings />
        </TabsContent>
      </Tabs>
    </Suspense>
  );
}
