import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailProvider } from "@/providers/EmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
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
      redirect(prefixPath(emailAccountId, "/assistant?onboarding=true"));
    }
  }

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        {/* dvh, not vh: the mobile URL bar overlaps 100vh. The tray var is
            the shared chrome height, so the composer sits exactly on the
            app tray (which hides while the input is focused). */}
        <div className="flex h-[calc(100dvh-var(--mobile-tray-h))] md:h-screen flex-col">
          <Chat open />
        </div>
      </Suspense>
    </EmailProvider>
  );
}
