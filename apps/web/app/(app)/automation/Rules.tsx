"use client";

import useSWR from "swr";
import Link from "next/link";
import { capitalCase } from "capital-case";
import { MoreHorizontalIcon } from "lucide-react";
import { RulesResponse } from "@/app/api/user/rules/route";
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
import {
  deleteRuleAction,
  setRuleAutomatedAction,
  setRuleRunOnThreadsAction,
} from "@/utils/actions/ai-rule";
import { RuleType } from "@prisma/client";
import { Toggle } from "@/components/Toggle";
import { ruleTypeToString } from "@/utils/rule";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { PremiumAlertWithData } from "@/components/PremiumAlert";

export function Rules() {
  const { data, isLoading, error, mutate } = useSWR<
    RulesResponse,
    { error: string }
  >(`/api/user/rules`);

  return (
    <div>
      {/* only show once a rule has been created */}
      {data && data.length > 0 && (
        <div className="my-2">
          <PremiumAlertWithData />
        </div>
      )}

      <Card>
        <LoadingContent loading={isLoading} error={error}>
          {data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Conditions</TableHead>
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
                      {getInstructions(rule)}
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
                          {rule.type !== RuleType.AI && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/automation/rule/${rule.id}/examples`}
                              >
                                View Examples
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link href={`/automation/rule/${rule.id}`}>
                              Edit
                            </Link>
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
                <CardTitle>Create your first automation</CardTitle>
                <CardDescription>
                  Automations are the rules that will be applied to your
                  incoming emails.
                </CardDescription>
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
    </div>
  );
}

function Actions({ actions }: { actions: RulesResponse[number]["actions"] }) {
  return (
    <div className="flex flex-1 space-x-2">
      {actions?.map((action) => {
        return (
          <Badge key={action.id} color={getActionColor(action.type)}>
            {capitalCase(action.type)}
          </Badge>
        );
      })}
    </div>
  );
}

export function getInstructions(
  rule: Pick<
    RulesResponse[number],
    "type" | "instructions" | "from" | "subject" | "body" | "group"
  >,
) {
  switch (rule.type) {
    case RuleType.AI:
      return rule.instructions;
    case RuleType.STATIC:
      let from = rule.from ? `From: ${rule.from}` : "";
      let subject = rule.subject ? `Subject: ${rule.subject}` : "";
      // let body = rule.body ? `Body: ${rule.body}` : "";
      return `${from} ${subject}`.trim();
    case RuleType.GROUP:
      return `Group: ${rule.group?.name || "MISSING"}`;
  }
}
