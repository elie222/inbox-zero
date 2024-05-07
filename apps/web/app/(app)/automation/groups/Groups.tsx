"use client";

import useSWR from "swr";
import Link from "next/link";
import { LoadingContent } from "@/components/LoadingContent";
import { AlertBasic } from "@/components/Alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GroupsResponse } from "@/app/api/user/group/route";
import { ViewGroupButton } from "@/app/(app)/automation/groups/ViewGroup";
import { CreateGroupModalButton } from "@/app/(app)/automation/groups/CreateGroupModal";

export function Groups() {
  const { data, isLoading, error } = useSWR<GroupsResponse>(`/api/user/group`);

  return (
    <Card>
      <CardHeader className="space-y-0">
        <div className="flex justify-between">
          <div className="space-y-1.5">
            <CardTitle>Groups</CardTitle>
            <CardDescription>
              Groups are used to group together emails that are related to each
              other. They can be created manually, or preset group can be
              generated for you automatically with AI.
            </CardDescription>
          </div>
          <div>
            <CreateGroupModalButton
              existingGroups={data?.groups.map((group) => group.name) || []}
            />
          </div>
        </div>
      </CardHeader>
      <LoadingContent loading={isLoading} error={error}>
        {data?.groups.length ? (
          <GroupTable groups={data.groups} />
        ) : (
          <div className="mx-2 mb-2">
            <AlertBasic
              title="No groups"
              description="No groups have been created yet."
            />
          </div>
        )}
      </LoadingContent>
    </Card>
  );
}

function GroupTable({ groups }: { groups: GroupsResponse["groups"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Group</TableHead>
          <TableHead className="text-center">Group Items</TableHead>
          <TableHead>Rule</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.id}>
            <TableCell className="font-medium">{group.name}</TableCell>
            <TableCell className="text-center">{group._count.items}</TableCell>
            <TableCell>
              <Link href={`/automation/rule/${group.rule?.id}`}>
                {group.rule?.name || ""}
              </Link>
            </TableCell>
            <TableCell className="flex justify-end space-x-1 p-3 text-center">
              <ViewGroupButton groupId={group.id} name={group.name} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
