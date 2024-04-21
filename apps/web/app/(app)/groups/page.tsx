import { CreateGroupModalButton } from "@/app/(app)/groups/CreateGroupModal";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Card } from "@/components/Card";
import { TopSectionWithRightSection } from "@/components/TopSection";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import prisma from "@/utils/prisma";
import { ViewGroupButton } from "@/app/(app)/groups/ViewGroup";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not authenticated");

  const groups = await prisma.group.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      _count: { select: { items: true } },
    },
    orderBy: {
      name: "desc",
    },
  });

  return (
    <div>
      <TopSectionWithRightSection
        title="Groups"
        description="Manage your groups"
        rightComponent={
          <CreateGroupModalButton
            existingGroups={groups.map((group) => group.name)}
          />
        }
      />

      {groups.length ? (
        <Card className="mx-auto mt-4 max-w-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead className="text-center">Senders</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>{group.name}</TableCell>
                  <TableCell className="text-center">
                    {group._count.items}
                  </TableCell>
                  <TableCell className="p-3 text-center">
                    <ViewGroupButton groupId={group.id} name={group.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="p-4">
          <Card title="No groups">You do not have any groups.</Card>
        </div>
      )}
    </div>
  );
}
