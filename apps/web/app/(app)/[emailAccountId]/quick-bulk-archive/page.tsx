import { t } from "@lingui/core/macro";
import { ClientOnly } from "@/components/ClientOnly";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkArchiveTab } from "@/app/(app)/[emailAccountId]/quick-bulk-archive/BulkArchiveTab";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import { initLingui } from "@/utils/i18n/server";

export default async function QuickBulkArchivePage() {
  const i18n = await initLingui();

  return (
    <>
      <PermissionsCheck />

      <PageWrapper>
        <PageHeader title={t(i18n)`Quick Bulk Archive`} />

        <ClientOnly>
          <EmailStatsPreloader />
          <BulkArchiveTab />
        </ClientOnly>
      </PageWrapper>
    </>
  );
}
