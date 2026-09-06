import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailProvider } from "@/providers/EmailProvider";
import { Chat } from "@/components/assistant-chat/chat";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export const maxDuration = 300; // Applies to the actions

export default async function AssistantPage({
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

        <div className="flex h-[calc(100vh-theme(spacing.9)-theme(spacing.14)-env(safe-area-inset-bottom))] md:h-screen flex-col">
          <Chat open />
        </div>
      </Suspense>
    </EmailProvider>
  );
}
