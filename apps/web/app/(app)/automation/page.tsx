import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { History } from "@/app/(app)/automation/History";
import { Pending } from "@/app/(app)/automation/Pending";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Rules } from "@/app/(app)/automation/Rules";
import { Process } from "@/app/(app)/automation/Process";
import { KnowledgeBase } from "@/app/(app)/automation/knowledge/KnowledgeBase";
import { Groups } from "@/app/(app)/automation/group/Groups";
import { RulesPrompt } from "@/app/(app)/automation/RulesPrompt";
import { OnboardingModal } from "@/components/OnboardingModal";
import { PermissionsCheck } from "@/app/(app)/PermissionsCheck";
import { TabsToolbar } from "@/components/TabsToolbar";
import { GmailProvider } from "@/providers/GmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { Button } from "@/components/ui/button";

export const maxDuration = 300; // Applies to the actions

export default async function AutomationPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) redirect("/login");

  // onboarding redirect
  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(ASSISTANT_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding) {
    const hasRule = await prisma.rule.findFirst({
      where: { emailAccountId: email },
      select: { id: true },
    });

    if (!hasRule) {
      redirect("/automation/onboarding");
    }
  }

  return (
    <GmailProvider>
      <Suspense>
        <PermissionsCheck />

        <Tabs defaultValue="prompt">
          <TabsToolbar>
            <div className="w-full overflow-x-auto">
              <TabsList>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="rules">Rules</TabsTrigger>
                <TabsTrigger value="test">Test</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
                {/* <TabsTrigger value="groups">Groups</TabsTrigger> */}
              </TabsList>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href="/automation/onboarding">Set Up</Link>
              </Button>

              <OnboardingModal
                title="Getting started with AI Personal Assistant"
                description={
                  <>
                    Learn how to use the AI Personal Assistant to automatically
                    label, archive, and more.
                  </>
                }
                videoId="SoeNDVr7ve4"
              />
            </div>
          </TabsToolbar>

          <TabsContent value="prompt" className="content-container mb-10">
            <RulesPrompt />
          </TabsContent>
          <TabsContent value="rules" className="content-container mb-10">
            <Rules />
          </TabsContent>
          <TabsContent value="test" className="content-container mb-10">
            <Process />
          </TabsContent>
          <TabsContent value="history" className="content-container mb-10">
            <History />
          </TabsContent>
          <TabsContent value="pending" className="content-container mb-10">
            <Pending />
          </TabsContent>
          <TabsContent value="knowledge" className="content-container mb-10">
            <KnowledgeBase />
          </TabsContent>
          {/* no longer in use */}
          <TabsContent value="groups" className="content-container mb-10">
            <Groups />
          </TabsContent>
        </Tabs>
      </Suspense>
    </GmailProvider>
  );
}
