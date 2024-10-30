import { SetUpCategories } from "@/app/(app)/smart-categories/setup/SetUpCategories";
import { SmartCategoriesOnboarding } from "@/app/(app)/smart-categories/setup/SmartCategoriesOnboarding";
import { ClientOnly } from "@/components/ClientOnly";

export default function SetupCategoriesPage() {
  return (
    <>
      <SetUpCategories />
      <ClientOnly>
        <SmartCategoriesOnboarding />
      </ClientOnly>
    </>
  );
}
