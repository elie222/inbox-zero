"use client";

import { Trans } from "@lingui/react/macro";
import { ColdEmailList } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailList";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ColdEmailRejected } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailRejected";
import { ColdEmailTest } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailTest";
import { Button } from "@/components/ui/button";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";
import Link from "next/link";
import { MessageText } from "@/components/Typography";

export function ColdEmailContent({ searchParam }: { searchParam?: string }) {
  const { emailAccountId } = useAccount();

  return (
    <Tabs defaultValue="cold-emails" searchParam={searchParam}>
      <TabsList>
        <TabsTrigger value="cold-emails">
          <Trans>Cold Emails</Trans>
        </TabsTrigger>
        <TabsTrigger value="rejected">
          <Trans>Marked Not Cold</Trans>
        </TabsTrigger>
        <TabsTrigger value="test">
          <Trans>Test</Trans>
        </TabsTrigger>
        <TabsTrigger value="settings">
          <Trans>Settings</Trans>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="test" className="mb-10">
        <ColdEmailTest />
      </TabsContent>

      <TabsContent value="cold-emails" className="mb-10">
        <Card>
          <ColdEmailList />
        </Card>
      </TabsContent>
      <TabsContent value="rejected" className="mb-10">
        <Card>
          <ColdEmailRejected />
        </Card>
      </TabsContent>

      <TabsContent value="settings" className="mb-10">
        <MessageText className="my-4">
          <Trans>
            To manage cold email settings, go to the Assistant Rules tab and
            click Edit on the Cold Email rule.
          </Trans>
        </MessageText>
        <Button asChild variant="outline">
          <Link href={prefixPath(emailAccountId, "/automation?tab=rules")}>
            <Trans>Go to Assistant Rules</Trans>
          </Link>
        </Button>
      </TabsContent>
    </Tabs>
  );
}
