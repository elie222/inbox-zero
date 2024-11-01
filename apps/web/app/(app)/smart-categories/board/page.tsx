import { capitalCase } from "capital-case";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { isDefined } from "@/utils/types";
import { getUserCategories } from "@/utils/category.server";

export const dynamic = "force-dynamic";

const CATEGORY_ORDER = [
  "Unknown",
  "RequestMoreInformation",
  "Newsletter",
  "Marketing",
  "Receipts",
  "Support",
];

export default async function CategoriesPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const [categories, senders] = await Promise.all([
    getUserCategories(session.user.id),
    prisma.newsletter.findMany({
      where: { userId: session.user.id, categoryId: { not: null } },
      select: { id: true, email: true, categoryId: true },
    }),
  ]);

  if (!categories.length) return <div className="p-4">No categories found</div>;

  // Order categories
  const orderedCategories = [
    ...CATEGORY_ORDER.map((name) =>
      categories.find((c) => c.name === name),
    ).filter(isDefined),
    ...categories.filter((c) => !CATEGORY_ORDER.includes(c.name)),
  ];

  return (
    <div className="p-4">
      <ClientOnly>
        <KanbanBoard
          categories={orderedCategories.map((c) => ({
            id: c.id,
            title: capitalCase(c.name),
          }))}
          items={senders.map((s) => ({
            id: s.id,
            columnId: s.categoryId || "Uncategorized",
            content: s.email,
          }))}
        />
      </ClientOnly>
    </div>
  );
}
