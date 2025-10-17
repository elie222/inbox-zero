import { DeepCleanContent } from "@/app/(app)/[emailAccountId]/deep-clean/DeepCleanContent";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";

export default async function CategoriesPage() {
  return (
    <PageWrapper>
      <PermissionsCheck />
      <PageHeader
        title="Deep Clean"
        description="Clean out your inbox in minutes."
      />
      <DeepCleanContent />
    </PageWrapper>
  );
}
