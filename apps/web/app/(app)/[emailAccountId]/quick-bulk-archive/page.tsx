import { ClientOnly } from "@/components/ClientOnly";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { BulkArchiveTab } from "@/app/(app)/[emailAccountId]/quick-bulk-archive/BulkArchiveTab";

export default function QuickBulkArchivePage() {
  return (
    <>
      <PermissionsCheck />

      <ClientOnly>
        <ArchiveProgress />
      </ClientOnly>

      <PageWrapper>
        <PageHeader title="Quick Bulk Archive" />

        <ClientOnly>
          <BulkArchiveTab />
        </ClientOnly>
      </PageWrapper>
    </>
  );
}
