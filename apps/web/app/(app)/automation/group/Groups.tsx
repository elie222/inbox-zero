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
import { Button } from "@/components/ui/button";
import { RuleType } from "@prisma/client";

export function Groups() {
  const { data, isLoading, error } = useSWR<GroupsResponse>("/api/user/group");

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
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => {
          return (
            <TableRow key={group.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/automation/group/${group.id}`}
                  className="font-semibold"
                >
                  {group.name}
                </Link>
              </TableCell>
              <TableCell className="text-center">
                {group._count.items}
              </TableCell>
              <TableCell>
                {group.rule ? (
                  <Link
                    href={`/automation/rule/${group.rule.id}`}
                    className="hover:underline"
                  >
                    {group.rule.name || `Rule ${group.rule.id}`}
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/automation/rule/create?groupId=${group.id}&type=${RuleType.GROUP}`}
                    >
                      Attach
                    </Link>
                  </Button>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/automation/group/${group.id}/examples`}>
                      Matching Emails
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/automation/group/${group.id}`}>View</Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
