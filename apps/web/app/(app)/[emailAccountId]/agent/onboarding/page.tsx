import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { AgentOnboardingChat } from "./chat";
import { EmailProvider } from "@/providers/EmailProvider";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export default async function AgentOnboardingPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        <div className="flex h-screen flex-col">
          <AgentOnboardingChat />
        </div>
      </Suspense>
    </EmailProvider>
  );
}
