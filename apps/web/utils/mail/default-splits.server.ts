import prisma from "@/utils/prisma";
import { getDefaultMailSplitDrafts } from "@/utils/mail/default-splits";

export async function seedDefaultMailSplits({
  emailAccountId,
  rules,
}: {
  emailAccountId: string;
  rules: Parameters<typeof getDefaultMailSplitDrafts>[0];
}) {
  const defaultSplits = getDefaultMailSplitDrafts(rules);
  if (defaultSplits.length === 0) return;

  const existingSplitCount = await prisma.mailSplit.count({
    where: { emailAccountId },
  });
  if (existingSplitCount > 0) return;

  await prisma.mailSplit.createMany({
    data: defaultSplits.map((split, order) => ({
      ...split,
      emailAccountId,
      order,
    })),
    skipDuplicates: true,
  });
}
