"use client";

import useSWR from "swr";
import Link from "next/link";
import { capitalCase } from "capital-case";
import { MoreHorizontalIcon } from "lucide-react";
import { RulesResponse } from "@/app/api/user/rules/controller";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  deleteRuleAction,
  setRuleAutomatedAction,
  setRuleRunOnThreadsAction,
} from "@/utils/actions";
import { RuleType } from "@prisma/client";
import { Toggle } from "@/components/Toggle";
import { ruleTypeToString } from "@/utils/rule";

export function Rules() {
  const { data, isLoading, error, mutate } = useSWR<
    RulesResponse,
    { error: string }
  >(`/api/user/rules`);

  return (
    <Card>
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
                <TableHead className="text-center">Threads</TableHead>
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
                  <TableCell className="font-medium">
                    <Link href={`/automation/rule/${rule.id}`}>
                      {rule.name}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap">
                    {rule.instructions}
                  </TableCell>
                  <TableCell>{ruleTypeToString(rule.type)}</TableCell>
                  <TableCell>
                    <Actions actions={rule.actions} />
                  </TableCell>
                  <TableCell>
                    <Toggle
                      enabled={rule.automate}
                      name="automate"
                      onChange={async () => {
                        await setRuleAutomatedAction(rule.id, !rule.automate);
                        mutate();
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Toggle
                      enabled={rule.runOnThreads}
                      name="runOnThreads"
                      onChange={async () => {
                        await setRuleRunOnThreadsAction(
                          rule.id,
                          !rule.runOnThreads,
                        );
                        mutate();
                      }}
                    />
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
                        <DropdownMenuItem asChild>
                          <Link href={`/automation/rule/${rule.id}`}>View</Link>
                        </DropdownMenuItem>
                        {rule.type !== RuleType.AI && (
                          <DropdownMenuItem asChild>
                            <Link href={`/automation/rule/${rule.id}/examples`}>
                              Examples
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link href={`/automation/rule/${rule.id}`}>Edit</Link>
                        </DropdownMenuItem>
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
                <Link href="/automation/create">Create Automation</Link>
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
