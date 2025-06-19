import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircleIcon, SlidersIcon } from "lucide-react";
import prisma from "@/utils/prisma";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Pending } from "@/app/(app)/[emailAccountId]/assistant/Pending";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { KnowledgeBase } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeBase";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPrompt";
import { OnboardingModal } from "@/components/OnboardingModal";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { TabsToolbar } from "@/components/TabsToolbar";
import { EmailProvider } from "@/providers/EmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { Button } from "@/components/ui/button";

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
      redirect(prefixPath(emailAccountId, "/assistant/onboarding"));
    }
  }

  const hasPendingRule = prisma.rule.findFirst({
    where: { emailAccountId, automate: false },
    select: { id: true },
  });

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        {/* <div className="content-container mt-2">
          <AlertWithButton
            title="Try our new AI Assistant experience"
            description="This is the legacy assistant interface. Experience our improved AI Assistant with better conversation flow and enhanced capabilities."
            icon={<SparklesIcon className="h-4 w-4" />}
            variant="blue"
            button={
              <Button asChild variant="blue">
                <Link href={prefixPath(emailAccountId, "/assistant")}>
                  Try New Assistant
                </Link>
              </Button>
            }
          />
        </div> */}

        <Tabs defaultValue="prompt">
          <TabsToolbar>
            <div className="w-full overflow-x-auto">
              <TabsList>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="rules">Rules</TabsTrigger>
                <TabsTrigger value="test">Test</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <Suspense>
                  {(await hasPendingRule) && (
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                  )}
                </Suspense>
                <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link
                  href={prefixPath(emailAccountId, "/assistant/onboarding")}
                >
                  <SlidersIcon className="mr-2 hidden size-4 md:block" />
                  View Setup
                </Link>
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
                buttonProps={{ size: "sm", variant: "outline" }}
              />

              <Button size="sm" variant="primaryBlue" asChild>
                <Link href={prefixPath(emailAccountId, "/assistant")}>
                  <MessageCircleIcon className="mr-2 size-4" />
                  AI Chat
                </Link>
              </Button>
            </div>
          </TabsToolbar>

          <TabsContent value="prompt" className="content-container mb-10">
            <div className="max-w-screen-xl">
              <RulesPrompt />
            </div>
          </TabsContent>
          <TabsContent value="rules" className="content-container mb-10">
            <div className="max-w-screen-lg">
              <Rules />
            </div>
          </TabsContent>
          <TabsContent value="test" className="content-container mb-10">
            <div className="max-w-screen-lg">
              <Process />
            </div>
          </TabsContent>
          <TabsContent value="history" className="content-container mb-10">
            <div className="max-w-screen-lg">
              <History />
            </div>
          </TabsContent>
          <Suspense>
            {(await hasPendingRule) && (
              <TabsContent value="pending" className="content-container mb-10">
                <div className="max-w-screen-lg">
                  <Pending />
                </div>
              </TabsContent>
            )}
          </Suspense>
          <TabsContent value="knowledge" className="content-container mb-10">
            <div className="max-w-screen-lg">
              <KnowledgeBase />
            </div>
          </TabsContent>
        </Tabs>
      </Suspense>
    </EmailProvider>
  );
}
