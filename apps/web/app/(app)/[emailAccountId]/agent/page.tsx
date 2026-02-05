import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { AgentPage } from "./agent-page";
import { EmailProvider } from "@/providers/EmailProvider";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export const maxDuration = 300;

export default async function AgentPageRoute({
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

        <div className="flex h-[calc(100vh-theme(spacing.16))] flex-col">
          <AgentPage />
        </div>
      </Suspense>
    </EmailProvider>
  );
}
