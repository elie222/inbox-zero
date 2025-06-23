import { SetUpCategories } from "@/app/(app)/[emailAccountId]/smart-categories/setup/SetUpCategories";
import { SmartCategoriesOnboarding } from "@/app/(app)/[emailAccountId]/smart-categories/setup/SmartCategoriesOnboarding";
import { ClientOnly } from "@/components/ClientOnly";
import { getUserCategories } from "@/utils/category.server";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export default async function SetupCategoriesPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

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
