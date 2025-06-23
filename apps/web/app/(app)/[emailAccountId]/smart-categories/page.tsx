import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PenIcon, SparklesIcon } from "lucide-react";
import sortBy from "lodash/sortBy";
import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { GroupedTable } from "@/components/GroupedTable";
import { TopBar } from "@/components/TopBar";
import { CreateCategoryButton } from "@/app/(app)/[emailAccountId]/smart-categories/CreateCategoryButton";
import { getUserCategoriesWithRules } from "@/utils/category.server";
import { CategorizeWithAiButton } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeWithAiButton";
import {
  Card,
  CardContent,
  CardTitle,
  CardHeader,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Uncategorized } from "@/app/(app)/[emailAccountId]/smart-categories/Uncategorized";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import { CategorizeSendersProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { getCategorizationProgress } from "@/utils/redis/categorization-progress";
import { prefixPath } from "@/utils/path";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const [senders, categories, emailAccount, progress] = await Promise.all([
    prisma.newsletter.findMany({
      where: { emailAccountId, categoryId: { not: null } },
      select: {
        id: true,
        email: true,
        category: { select: { id: true, description: true, name: true } },
      },
    }),
    getUserCategoriesWithRules({ emailAccountId }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { autoCategorizeSenders: true },
    }),
    getCategorizationProgress({ emailAccountId }),
  ]);

  if (!(senders.length > 0 || categories.length > 0))
    redirect(prefixPath(emailAccountId, "/smart-categories/setup"));

  return (
    <>
      <PermissionsCheck />

      <ClientOnly>
        <ArchiveProgress />
        <CategorizeSendersProgress refresh={!!progress} />
      </ClientOnly>

      <PremiumAlertWithData className="mx-2 mt-2 sm:mx-4" />

      <Suspense>
        <Tabs defaultValue="categories">
          <TopBar className="items-center">
            <TabsList>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="uncategorized">Uncategorized</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <CategorizeWithAiButton
                buttonProps={{
                  children: (
                    <>
                      <SparklesIcon className="mr-2 size-4" />
                      Bulk Categorize
                    </>
                  ),
                  variant: "outline",
                }}
              />
              <Button variant="outline" asChild>
                <Link
                  href={prefixPath(emailAccountId, "/smart-categories/setup")}
                >
                  <PenIcon className="mr-2 size-4" />
                  Edit
                </Link>
              </Button>
              <CreateCategoryButton />
            </div>
          </TopBar>

          <TabsContent value="categories" className="m-0">
            {senders.length === 0 && (
              <Card className="m-4">
                <CardHeader>
                  <CardTitle>Categorize Senders</CardTitle>
                  <CardDescription>
                    Now that you have some categories, our AI can categorize
                    senders.
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
                  category:
                    categories.find(
                      (category) => category.id === sender.category?.id,
                    ) || null,
                }))}
                categories={categories}
              />
            </ClientOnly>
          </TabsContent>

          <TabsContent value="uncategorized" className="m-0">
            <Uncategorized
              categories={categories}
              autoCategorizeSenders={
                emailAccount?.autoCategorizeSenders || false
              }
            />
          </TabsContent>
        </Tabs>
      </Suspense>
    </>
  );
}
