import { t } from "@lingui/core/macro";
import { getUsage } from "@/utils/redis/usage";
import { Usage } from "@/app/(app)/[emailAccountId]/usage/usage";
import { auth } from "@/utils/auth";
import {
  getMemberEmailAccount,
  getCallerEmailAccount,
} from "@/utils/organizations/access";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { notFound } from "next/navigation";
import prisma from "@/utils/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { initLingui } from "@/utils/i18n/server";

export default async function UsagePage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const i18n = await initLingui();
  const { emailAccountId } = await props.params;
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) notFound();

  try {
    await checkUserOwnsEmailAccount({ emailAccountId });
  } catch {
    const callerEmailAccount = await getCallerEmailAccount(
      userId,
      emailAccountId,
    );

    if (!callerEmailAccount) notFound();

    const memberEmailAccount = await getMemberEmailAccount(
      callerEmailAccount.id,
      emailAccountId,
    );

    if (!memberEmailAccount) notFound();
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      email: true,
      name: true,
      user: {
        select: { id: true },
      },
    },
  });

  if (!emailAccount) notFound();

  const usage = await getUsage({
    emailAccountId,
    legacyEmail: emailAccount.email,
    userId: emailAccount.user.id,
  });
  const isOwnAccount = emailAccount.user.id === userId;
  const accountName = emailAccount.name || emailAccount.email;

  return (
    <PageWrapper>
      <PageHeader
        title={
          isOwnAccount
            ? t(i18n)`Credits and Usage`
            : t(i18n)`Credits and Usage for ${accountName}`
        }
      />
      <div className="my-4">
        <Usage usage={usage} />
      </div>
    </PageWrapper>
  );
}
