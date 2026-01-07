import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { getUserCategoriesWithRules } from "@/utils/category.server";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { BulkArchiveContent } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveContent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function BulkArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { emailAccountId } = await params;
  const { onboarding } = await searchParams;
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

  const hasCategorizedSenders = senders.length > 0;
  const showOnboarding = onboarding === "true" || !hasCategorizedSenders;

  return (
    <>
      <PermissionsCheck />

      <ClientOnly>
        <ArchiveProgress />
      </ClientOnly>

      {showOnboarding ? (
        <ClientOnly>
          <BulkArchiveContent
            initialSenders={senders}
            initialCategories={categories}
            showOnboarding
          />
        </ClientOnly>
      ) : (
        <PageWrapper>
          <PageHeader title="Bulk Archive" />

          <ClientOnly>
            <BulkArchiveContent
              initialSenders={senders}
              initialCategories={categories}
            />
          </ClientOnly>
        </PageWrapper>
      )}
    </>
  );
}
