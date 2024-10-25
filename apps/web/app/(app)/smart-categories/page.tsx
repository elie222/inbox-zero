import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ClientOnly } from "@/components/ClientOnly";
import { GroupedTable } from "@/components/GroupedTable";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const senders = await prisma.newsletter.findMany({
    where: { userId: session.user.id, categoryId: { not: null } },
    select: {
      id: true,
      email: true,
      category: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="">
      <ClientOnly>
        <GroupedTable
          emailGroups={senders.map((sender) => ({
            address: sender.email,
            category: sender.category,
          }))}
        />
      </ClientOnly>
    </div>
  );
}
