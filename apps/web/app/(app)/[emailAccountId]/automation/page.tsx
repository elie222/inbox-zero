import { Suspense } from "react";
import { SparklesIcon } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Pending } from "@/app/(app)/[emailAccountId]/assistant/Pending";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailProvider } from "@/providers/EmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/settings/SettingsTab";
import { TabSelect } from "@/components/TabSelect";
import { RulesTab } from "@/app/(app)/[emailAccountId]/assistant/RulesTabNew";
import { AIChatButton } from "@/app/(app)/[emailAccountId]/assistant/AIChatButton";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DismissibleVideoCard } from "@/components/VideoCard";

export const maxDuration = 300; // Applies to the actions

const tabOptions = (emailAccountId: string) => [
  {
    id: "rules",
    label: "Rules",
    href: `/${emailAccountId}/automation?tab=rules`,
  },
  {
    id: "test",
    label: "Test",
    href: `/${emailAccountId}/automation?tab=test`,
  },
  {
    id: "history",
    label: "History",
    href: `/${emailAccountId}/automation?tab=history`,
  },
  {
    id: "settings",
    label: "Settings",
    href: `/${emailAccountId}/automation?tab=settings`,
  },
];

export default async function AutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ tab: string }>;
}) {
  const { emailAccountId } = await params;
  const { tab } = await searchParams;
  await checkUserOwnsEmailAccount({ emailAccountId });

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

  const hasPendingRule = prisma.rule
    .findFirst({
      where: { emailAccountId, automate: false },
      select: { id: true },
    })
    .then((rule) => rule !== null);

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        <PageWrapper>
          <PremiumAlertWithData className="mb-8" />

          <div className="flex items-center justify-between">
            <div>
              <PageHeader
                title="AI Assistant"
                description="Personalized AI to help you manage emails faster."
                video={{
                  title: "Getting started with AI Personal Assistant",
                  description:
                    "Learn how to use the AI Personal Assistant to automatically label, archive, and more.",
                  muxPlaybackId: "VwIP7UAw4MXDjkvmLjJzGsY00ee9jxIZVI952DoBBfp8",
                }}
              />
            </div>

            <div className="ml-4">
              <AIChatButton />
            </div>
          </div>

          <div className="border-b border-neutral-200 pt-2">
            <Suspense
              fallback={
                <TabSelect
                  options={tabOptions(emailAccountId)}
                  selected={tab ?? "rules"}
                />
              }
            >
              <TabNavigation
                emailAccountId={emailAccountId}
                tab={tab}
                hasPendingRule={hasPendingRule}
              />
            </Suspense>
          </div>

          <DismissibleVideoCard
            className="my-4"
            icon={<SparklesIcon className="h-5 w-5" />}
            title="Getting started with AI Assistant"
            description={
              "Learn how to use the AI Assistant to automatically label, archive, and more."
            }
            muxPlaybackId="VwIP7UAw4MXDjkvmLjJzGsY00ee9jxIZVI952DoBBfp8"
            storageKey="ai-assistant-onboarding-video"
          />

          <Tabs defaultValue="rules">
            <TabsContent value="rules" className="mb-10">
              <RulesTab />
            </TabsContent>
            <TabsContent value="settings" className="mb-10">
              <SettingsTab />
            </TabsContent>
            <TabsContent value="test" className="mb-10">
              <Process />
            </TabsContent>
            <TabsContent value="history" className="mb-10">
              <History />
            </TabsContent>
            <Suspense>
              <PendingTab hasPendingRule={hasPendingRule} />
            </Suspense>
          </Tabs>
        </PageWrapper>
      </Suspense>
    </EmailProvider>
  );
}

async function TabNavigation({
  emailAccountId,
  tab,
  hasPendingRule,
}: {
  emailAccountId: string;
  tab: string;
  hasPendingRule: Promise<boolean>;
}) {
  return (
    <TabSelect
      options={[
        ...tabOptions(emailAccountId),
        ...((await hasPendingRule)
          ? [
              {
                id: "pending",
                label: "Pending",
                href: `/${emailAccountId}/automation?tab=pending`,
              },
            ]
          : []),
      ]}
      selected={tab ?? "rules"}
    />
  );
}

async function PendingTab({
  hasPendingRule,
}: {
  hasPendingRule: Promise<boolean>;
}) {
  const hasPendingRuleValue = await hasPendingRule;

  if (!hasPendingRuleValue) return null;

  return (
    <TabsContent value="pending" className="mb-10">
      <Pending />
    </TabsContent>
  );
}
