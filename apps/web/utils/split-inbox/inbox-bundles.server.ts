import {
  ActionType,
  MailSplitFilterKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

/** Categories people tend to clear in bulk rather than read one by one. */
const DEFAULT_BUNDLED_SYSTEM_TYPES = [
  SystemType.NOTIFICATION,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.RECEIPT,
  SystemType.CALENDAR,
  SystemType.COLD_EMAIL,
];

/**
 * The first time bundling is turned on, pre-select the splits that show one of
 * those categories' labels, so the feature does something before any setup.
 * Later re-enables keep whatever the user chose, including nothing.
 */
export async function seedDefaultInboxBundles(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { mailBundleInbox: true },
  });
  if (emailAccount?.mailBundleInbox !== null) return;

  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      enabled: true,
      systemType: { in: DEFAULT_BUNDLED_SYSTEM_TYPES },
    },
    select: {
      actions: {
        where: { type: ActionType.LABEL, labelId: { not: null } },
        select: { labelId: true },
      },
    },
  });
  const labelIds = rules.flatMap((rule) =>
    rule.actions.flatMap((action) => (action.labelId ? [action.labelId] : [])),
  );
  if (!labelIds.length) return;

  await prisma.mailSplit.updateMany({
    where: {
      emailAccountId,
      filters: {
        some: {},
        every: { kind: MailSplitFilterKind.LABEL, value: { in: labelIds } },
      },
    },
    data: { bundleInInbox: true },
  });
}
