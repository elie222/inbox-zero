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
import type { GroupsResponse } from "@/app/api/user/group/route";
import { ViewGroupButton } from "@/app/(app)/automation/group/ViewGroup";
import { CreateGroupModalButton } from "@/app/(app)/automation/group/CreateGroupModal";
import { Button } from "@/components/ui/button";

export function Groups() {
  const { data, isLoading, error } = useSWR<GroupsResponse>(`/api/user/group`);

  return (
    <Card>
      <CardHeader className="space-y-0">
        <div className="flex justify-between">
          <div className="space-y-1.5">
            <CardTitle>Groups</CardTitle>
            <CardDescription className="mr-2 max-w-prose">
              Groups organize related emails allowing you to apply actions to
              matching emails. Create custom groups manually or create a preset
              group using our AI.
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
          <TableHead>Automation</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => {
          return (
            <TableRow key={group.id}>
              <TableCell className="font-medium">{group.name}</TableCell>
              <TableCell className="text-center">
                {group._count.items}
              </TableCell>
              <TableCell>
                <Link href={`/automation/rule/${group.rule?.id}`}>
                  {group.rule ? (
                    group.rule.name || `Rule ${group.rule.id}`
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/automation/rule/create?groupId=${group.id}&tab=GROUP`}
                      >
                        Attach Automation
                      </Link>
                    </Button>
                  )}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/automation/group/${group.id}/examples`}>
                      Matching Emails
                    </Link>
                  </Button>
                  <ViewGroupButton groupId={group.id} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
