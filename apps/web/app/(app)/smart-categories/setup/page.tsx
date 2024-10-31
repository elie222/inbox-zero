import { SetUpCategories } from "@/app/(app)/smart-categories/setup/SetUpCategories";
import { SmartCategoriesOnboarding } from "@/app/(app)/smart-categories/setup/SmartCategoriesOnboarding";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ClientOnly } from "@/components/ClientOnly";
import { getUserCategories } from "@/utils/category.server";

export default async function SetupCategoriesPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const categories = await getUserCategories(session.user.id);

  return (
    <>
      <SetUpCategories existingCategories={categories} />
      <ClientOnly>
        <SmartCategoriesOnboarding />
      </ClientOnly>
    </>
  );
}
