import { DeepCleanContent } from "@/app/(app)/[emailAccountId]/deep-clean/DeepCleanContent";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";

export default async function CategoriesPage() {
  return (
    <>
      <PermissionsCheck />
      <DeepCleanContent />
    </>
  );
}
