import { Fragment } from "react";
import { ColdEmailList } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailList";
import { ColdEmailSettings } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailSettings";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ColdEmailRejected } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailRejected";
import { ColdEmailTest } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailTest";
import { TabsToolbar } from "@/components/TabsToolbar";
import { cn } from "@/utils";

export function ColdEmailContent({
  isInset,
  searchParam,
}: {
  isInset: boolean;
  searchParam?: string;
}) {
  const ToolbarWrapper = isInset ? TabsToolbar : Fragment;
  const tabContentClassName = isInset ? "content-container" : "";

  return (
    <Tabs defaultValue="settings" searchParam={searchParam}>
      <ToolbarWrapper>
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="cold-emails">Cold Emails</TabsTrigger>
          <TabsTrigger value="rejected">Marked Not Cold</TabsTrigger>
        </TabsList>
      </ToolbarWrapper>

      <TabsContent
        value="settings"
        className={cn("mb-10", tabContentClassName)}
      >
        <ColdEmailSettings />
      </TabsContent>

      <TabsContent value="test" className={cn("mb-10", tabContentClassName)}>
        <ColdEmailTest />
      </TabsContent>

      <TabsContent
        value="cold-emails"
        className={cn("mb-10", tabContentClassName)}
      >
        <Card>
          <ColdEmailList />
        </Card>
      </TabsContent>
      <TabsContent
        value="rejected"
        className={cn("mb-10", tabContentClassName)}
      >
        <Card>
          <ColdEmailRejected />
        </Card>
      </TabsContent>
    </Tabs>
  );
}
