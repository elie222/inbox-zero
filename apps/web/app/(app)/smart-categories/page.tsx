import sortBy from "lodash/sortBy";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { GroupedTable } from "@/components/GroupedTable";
import { TopBar } from "@/components/TopBar";
import { CreateCategoryButton } from "@/app/(app)/smart-categories/CreateCategoryButton";
import { TypographyH4 } from "@/components/Typography";
import { SetUpCategories } from "@/app/(app)/smart-categories/SetUpCategories";
import { getUserCategories } from "@/utils/category.server";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const [senders, categories] = await Promise.all([
    prisma.newsletter.findMany({
      where: { userId: session.user.id, categoryId: { not: null } },
      select: {
        id: true,
        email: true,
        category: { select: { id: true, name: true } },
      },
    }),
    getUserCategories(session.user.id),
  ]);

  return (
    <NuqsAdapter>
      <TopBar className="items-center">
        <TypographyH4>Categories</TypographyH4>
        <CreateCategoryButton />
      </TopBar>

      {senders.length > 0 ? (
        <ClientOnly>
          <GroupedTable
            emailGroups={sortBy(senders, (sender) => sender.category?.name).map(
              (sender) => ({
                address: sender.email,
                category: sender.category,
              }),
            )}
            categories={categories}
          />
        </ClientOnly>
      ) : (
        <SetUpCategories userCategories={categories} />
      )}
    </NuqsAdapter>
  );
}
