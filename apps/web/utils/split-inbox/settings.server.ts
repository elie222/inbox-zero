import { MailSetupState } from "@/generated/prisma/enums";
import { ensureAllMailSplit } from "@/utils/split-inbox/initial-splits";
import prisma from "@/utils/prisma";

export async function getMailSettings({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      mailLayout: true,
      mailExpandedPreview: true,
      mailBundleInbox: true,
      mailDefaultSplitId: true,
      mailSetup: true,
      mailSplits: {
        // createdAt breaks ties so tab order can't shuffle between requests
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          order: true,
          matchAll: true,
          bundleInInbox: true,
          hideFromAll: true,
          filters: {
            orderBy: { order: "asc" },
            select: { kind: true, value: true },
          },
        },
      },
    },
  });

  return {
    layout: emailAccount?.mailLayout ?? null,
    expandedPreview: emailAccount?.mailExpandedPreview ?? false,
    bundleInbox: emailAccount?.mailBundleInbox ?? false,
    defaultSplitId: emailAccount?.mailDefaultSplitId ?? null,
    setup: emailAccount?.mailSetup ?? MailSetupState.DONE,
    splits: ensureAllMailSplit(emailAccount?.mailSplits ?? []),
  };
}
