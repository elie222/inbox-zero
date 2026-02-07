import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ActivityPanel, SkillsPanel, ToolsPanel } from "./agent-page";
import { AgentChat } from "./chat";
import { EmailProvider } from "@/providers/EmailProvider";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { TabSelect } from "@/components/TabSelect";

export const maxDuration = 300;

const tabOptions = (emailAccountId: string) => [
  {
    id: "chat",
    label: "Chat",
    href: `/${emailAccountId}/agent?tab=chat`,
  },
  {
    id: "activity",
    label: "Activity",
    href: `/${emailAccountId}/agent?tab=activity`,
  },
  {
    id: "skills",
    label: "Skills",
    href: `/${emailAccountId}/agent?tab=skills`,
  },
  {
    id: "tools",
    label: "Tools",
    href: `/${emailAccountId}/agent?tab=tools`,
  },
];

export default async function AgentPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { emailAccountId } = await params;
  const { tab } = await searchParams;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const selectedTab = tab ?? "chat";

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        <PageWrapper>
          <PageHeader title="AI Agent" />

          <div className="border-b border-neutral-200 pt-2">
            <TabSelect
              options={tabOptions(emailAccountId)}
              selected={selectedTab}
            />
          </div>

          <div className="mt-4">
            {selectedTab === "chat" && (
              <div className="h-[60dvh] min-h-[400px]">
                <AgentChat />
              </div>
            )}
            {selectedTab === "activity" && <ActivityPanel />}
            {selectedTab === "skills" && <SkillsPanel />}
            {selectedTab === "tools" && <ToolsPanel />}
          </div>
        </PageWrapper>
      </Suspense>
    </EmailProvider>
  );
}
