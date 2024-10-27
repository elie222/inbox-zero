import sortBy from "lodash/sortBy";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { GroupedTable } from "@/components/GroupedTable";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

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
    prisma.category.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <NuqsAdapter>
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
        <Card className="m-4">
          <CardHeader>
            <CardTitle>No email addresses categorized yet.</CardTitle>
          </CardHeader>

          {/* <CardContent>
            <form onSubmit={categorizeSendersAction}>
              <Button type="submit">Categorize email addresses</Button>
            </form>
          </CardContent> */}
        </Card>
      )}
    </NuqsAdapter>
  );
}
