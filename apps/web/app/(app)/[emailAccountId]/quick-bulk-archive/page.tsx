import sortBy from "lodash/sortBy";
import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { getUserCategoriesWithRules } from "@/utils/category.server";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { BulkArchiveTab } from "@/app/(app)/[emailAccountId]/quick-bulk-archive/BulkArchiveTab";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function QuickBulkArchivePage({
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

      <ClientOnly>
        <ArchiveProgress />
      </ClientOnly>

      <PageWrapper>
        <PageHeader title="Quick Bulk Archive" />

        <ClientOnly>
          <BulkArchiveTab
            emailGroups={sortBy(senders, (sender) => sender.category?.name).map(
              (sender) => ({
                address: sender.email,
                category:
                  categories.find(
                    (category) => category.id === sender.category?.id,
                  ) || null,
              }),
            )}
          />
        </ClientOnly>
      </PageWrapper>
    </>
  );
}
