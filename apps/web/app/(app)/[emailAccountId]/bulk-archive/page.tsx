import prisma from "@/utils/prisma";
import { getUserCategoriesWithRules } from "@/utils/category.server";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { BulkArchive } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function BulkArchivePage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const [senders, categories] = await Promise.all([
    prisma.newsletter.findMany({
      where: { emailAccountId, categoryId: { not: null } },
      select: {
        id: true,
        email: true,
        category: { select: { id: true, description: true, name: true } },
      },
    }),
    getUserCategoriesWithRules({ emailAccountId }),
  ]);

  return (
    <>
      <PermissionsCheck />
      <BulkArchive initialSenders={senders} initialCategories={categories} />
    </>
  );
}
