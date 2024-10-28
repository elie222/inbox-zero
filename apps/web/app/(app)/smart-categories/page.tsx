import { Suspense } from "react";
import sortBy from "lodash/sortBy";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { GroupedTable } from "@/components/GroupedTable";
import { TopBar } from "@/components/TopBar";
import { CreateCategoryButton } from "@/app/(app)/smart-categories/CreateCategoryButton";
import { SetUpCategories } from "@/app/(app)/smart-categories/SetUpCategories";
import { getUserCategories } from "@/utils/category.server";
import { CategorizeWithAiButton } from "@/app/(app)/smart-categories/CategorizeWithAiButton";
import {
  Card,
  CardContent,
  CardTitle,
  CardHeader,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Uncategorized } from "@/app/(app)/smart-categories/Uncategorized";

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
      <Suspense>
        <Tabs defaultValue="categories">
          <TopBar className="items-center">
            <TabsList>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="uncategorized">Uncategorized</TabsTrigger>
            </TabsList>

            <CreateCategoryButton />
          </TopBar>

          <TabsContent value="categories">
            {senders.length > 0 || categories.length > 0 ? (
              <>
                {senders.length === 0 && (
                  <Card className="m-4">
                    <CardHeader>
                      <CardTitle>Categorize with AI</CardTitle>
                      <CardDescription>
                        Now that you have some categories, our AI can categorize
                        senders for you automatically.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CategorizeWithAiButton />
                    </CardContent>
                  </Card>
                )}

                <ClientOnly>
                  <GroupedTable
                    emailGroups={sortBy(
                      senders,
                      (sender) => sender.category?.name,
                    ).map((sender) => ({
                      address: sender.email,
                      category: sender.category,
                    }))}
                    categories={categories}
                  />
                </ClientOnly>
              </>
            ) : (
              <SetUpCategories />
            )}
          </TabsContent>

          <TabsContent value="uncategorized" className="m-0">
            <Uncategorized categories={categories} />
          </TabsContent>
        </Tabs>
      </Suspense>
    </NuqsAdapter>
  );
}
