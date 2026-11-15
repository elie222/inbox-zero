import { redirect } from "next/navigation";
import { MailShell } from "@/app/(app)/[emailAccountId]/mail/MailShell";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailLabelsProvider } from "@/providers/EmailLabelsProvider";
import { auth } from "@/utils/auth";
import { MailEngineHost } from "@/utils/mail-engine/MailEngineHost";
import { isPremiumRecord, premiumEntitlementSelect } from "@/utils/premium";
import prisma from "@/utils/prisma";

export const maxDuration = 180;

export default async function Mail() {
  // The email app is part of the paid plans, so users without one (including
  // a lapsed trial) are sent to pick a plan before the mailbox loads.
  const session = await auth();
  const user = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { premium: { select: premiumEntitlementSelect } },
      })
    : null;
  if (!isPremiumRecord(user?.premium)) redirect("/welcome-upgrade");

  return (
    <EmailLabelsProvider>
      <MailEngineHost>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PermissionsCheck />
          <MailShell />
        </div>
      </MailEngineHost>
    </EmailLabelsProvider>
  );
}
