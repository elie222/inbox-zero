"use client";

import useSWR from "swr";
import { capitalCase } from "capital-case";
import { MoreHorizontalIcon } from "lucide-react";
import { RulesResponse } from "@/app/api/user/rules/controller";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tag } from "@/components/Tag";
import Link from "next/link";
import { deleteRuleAction } from "@/utils/actions";

export function Rules() {
  const { data, isLoading, error, mutate } = useSWR<
    RulesResponse,
    { error: string }
  >(`/api/user/rules`);

  return (
    <Card className="m-4">
      <LoadingContent loading={isLoading} error={error}>
        {data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Instructions</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead className="text-center">Automated</TableHead>
                <TableHead className="text-center">Run on Threads</TableHead>
                {/* <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Executed</TableHead> */}
                <TableHead>
                  <span className="sr-only">User Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{rule.instructions}</TableCell>
                  <TableCell>{capitalCase(rule.type)}</TableCell>
                  <TableCell>
                    <Actions actions={rule.actions} />
                  </TableCell>
                  <TableCell className="text-center">
                    {rule.automate ? "Yes" : "No"}
                  </TableCell>
                  <TableCell className="text-center">
                    {rule.runOnThreads ? "Yes" : "No"}
                  </TableCell>
                  {/* <TableCell className="text-right">33</TableCell>
                <TableCell className="text-right">43</TableCell> */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-haspopup="true"
                          size="icon"
                          variant="ghost"
                        >
                          <MoreHorizontalIcon className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            await deleteRuleAction(rule.id);
                            mutate();
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <>
            <CardHeader>
              <CardTitle>No automations</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/automation/new">Create Automation</Link>
              </Button>
            </CardContent>
          </>
        )}
      </LoadingContent>
    </Card>
  );
}

function Actions({ actions }: { actions: RulesResponse[number]["actions"] }) {
  return (
    <div className="flex flex-1 space-x-2">
      {actions?.map((action) => {
        return (
          <Tag key={action.id} color="green">
            {capitalCase(action.type)}
          </Tag>
        );
      })}
    </div>
  );
}
