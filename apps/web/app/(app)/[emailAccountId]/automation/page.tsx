import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { History } from "@/app/(app)/[emailAccountId]/automation/History";
import { Pending } from "@/app/(app)/[emailAccountId]/automation/Pending";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rules } from "@/app/(app)/[emailAccountId]/automation/Rules";
import { Process } from "@/app/(app)/[emailAccountId]/automation/Process";
import { KnowledgeBase } from "@/app/(app)/[emailAccountId]/automation/knowledge/KnowledgeBase";
import { Groups } from "@/app/(app)/[emailAccountId]/automation/group/Groups";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/automation/RulesPrompt";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { TabsToolbar } from "@/components/TabsToolbar";
import { GmailProvider } from "@/providers/GmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { ResizableHandle } from "@/components/ui/resizable";
import { ResizablePanelGroup } from "@/components/ui/resizable";
import { ResizablePanel } from "@/components/ui/resizable";
import { Chat } from "@/components/assistant-chat/chat";

export const maxDuration = 300; // Applies to the actions

export default async function AutomationPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;

  // onboarding redirect
  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(ASSISTANT_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding) {
    const hasRule = await prisma.rule.findFirst({
      where: { emailAccountId },
      select: { id: true },
    });

    if (!hasRule) {
      redirect(prefixPath(emailAccountId, "/automation/onboarding"));
    }
  }

  const hasPendingRule = prisma.rule.findFirst({
    where: { emailAccountId, automate: false },
    select: { id: true },
  });

  return (
    <GmailProvider>
      <Suspense>
        <PermissionsCheck />

        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel>
            <Chat
              id={emailAccountId} // TODO:
              initialMessages={[]}
              emailAccountId={emailAccountId}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel>
            <Tabs defaultValue="prompt" className="h-full">
              <TabsToolbar>
                <div className="w-full overflow-x-auto">
                  <TabsList>
                    {/* <TabsTrigger value="prompt">Prompt</TabsTrigger> */}
                    <TabsTrigger value="rules">Rules</TabsTrigger>
                    <TabsTrigger value="test">Test</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <Suspense>
                      {(await hasPendingRule) && (
                        <TabsTrigger value="pending">Pending</TabsTrigger>
                      )}
                    </Suspense>
                    <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
                    {/* <TabsTrigger value="groups">Groups</TabsTrigger> */}
                  </TabsList>
                </div>

                {/* <div className="flex items-center gap-2">
                  <Button asChild variant="outline">
                    <Link
                      href={prefixPath(
                        emailAccountId,
                        "/automation/onboarding",
                      )}
                    >
                      Set Up
                    </Link>
                  </Button>

                  <OnboardingModal
                    title="Getting started with AI Personal Assistant"
                    description={
                      <>
                        Learn how to use the AI Personal Assistant to
                        automatically label, archive, and more.
                      </>
                    }
                    videoId="SoeNDVr7ve4"
                  />
                </div> */}
              </TabsToolbar>

              <TabsContent value="prompt" className="mt-0 h-full">
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
              <TabsContent
                value="knowledge"
                className="content-container mb-10"
              >
                <KnowledgeBase />
              </TabsContent>
              {/* no longer in use */}
              <TabsContent value="groups" className="content-container mb-10">
                <Groups />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </Suspense>
    </GmailProvider>
  );
}
