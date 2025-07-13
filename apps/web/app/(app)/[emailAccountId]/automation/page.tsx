import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircleIcon, SlidersIcon } from "lucide-react";
import prisma from "@/utils/prisma";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Pending } from "@/app/(app)/[emailAccountId]/assistant/Pending";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { OnboardingModal } from "@/components/OnboardingModal";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { GmailProvider } from "@/providers/GmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { Button } from "@/components/ui/button";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/SettingsTab";
import { PageHeading } from "@/components/Typography";
import { TabSelect } from "@/components/TabSelect";
import { RulesTab } from "@/app/(app)/[emailAccountId]/assistant/RulesTab";

export const maxDuration = 300; // Applies to the actions

const tabOptions = (emailAccountId: string) => [
  {
    id: "rules",
    label: "Rules",
    href: `/${emailAccountId}/automation?tab=rules`,
  },
  {
    id: "settings",
    label: "Settings",
    href: `/${emailAccountId}/automation?tab=settings`,
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
    <GmailProvider>
      <Suspense>
        <PermissionsCheck />

        <div className="mx-4">
          <div className="w-screen-xl mx-auto max-w-screen-xl">
            <div className="w-full">
              <PremiumAlertWithData className="mb-2" />

              <div className="flex items-center justify-between">
                <PageHeading>Assistant</PageHeading>
                <ExtraActions emailAccountId={emailAccountId} />
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
            </div>
          </div>
        </div>
      </Suspense>
    </GmailProvider>
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

function ExtraActions({ emailAccountId }: { emailAccountId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href={prefixPath(emailAccountId, "/assistant/onboarding")}>
          <SlidersIcon className="mr-2 hidden size-4 md:block" />
          View Setup
        </Link>
      </Button>

      <OnboardingModal
        title="Getting started with AI Personal Assistant"
        description={
          <>
            Learn how to use the AI Personal Assistant to automatically label,
            archive, and more.
          </>
        }
        videoId="SoeNDVr7ve4"
        buttonProps={{ size: "sm", variant: "ghost" }}
      />

      <Button size="sm" variant="primaryBlue" asChild>
        <Link href={prefixPath(emailAccountId, "/assistant")}>
          <MessageCircleIcon className="mr-2 size-4" />
          AI Chat
        </Link>
      </Button>
    </div>
  );
}
