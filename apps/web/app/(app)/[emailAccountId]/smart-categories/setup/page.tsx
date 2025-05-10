import { SetUpCategories } from "@/app/(app)/[emailAccountId]/smart-categories/setup/SetUpCategories";
import { SmartCategoriesOnboarding } from "@/app/(app)/[emailAccountId]/smart-categories/setup/SmartCategoriesOnboarding";
import { ClientOnly } from "@/components/ClientOnly";
import { getUserCategories } from "@/utils/category.server";

export default async function SetupCategoriesPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const params = await props.params;
  const emailAccountId = params.emailAccountId;

  const categories = await getUserCategories({ emailAccountId });

  return (
    <>
      <SetUpCategories existingCategories={categories} />
      <ClientOnly>
        <SmartCategoriesOnboarding />
      </ClientOnly>
    </>
  );
}
