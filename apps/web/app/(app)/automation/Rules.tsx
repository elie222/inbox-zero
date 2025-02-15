"use client";

import Link from "next/link";
import { capitalCase } from "capital-case";
import {
  MoreHorizontalIcon,
  PenIcon,
  PlusIcon,
  AlertTriangleIcon,
  InfoIcon,
} from "lucide-react";
import type { RulesResponse } from "@/app/api/user/rules/route";
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
  setRuleAutomatedAction,
  setRuleRunOnThreadsAction,
  setRuleEnabledAction,
} from "@/utils/actions/ai-rule";
import { deleteRuleAction } from "@/utils/actions/rule";
import { Toggle } from "@/components/Toggle";
import { conditionsToString, conditionTypesToString } from "@/utils/condition";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/utils";
import { type RiskLevel, getRiskLevel } from "@/utils/risk";
import { useRules } from "@/hooks/useRules";

export function Rules() {
  const { data, isLoading, error, mutate } = useRules();

  const hasRules = !!data?.length;

  return (
    <div>
      <PremiumAlertWithData className="my-2" />

      <Card>
        <LoadingContent loading={isLoading} error={error}>
          {hasRules ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead className="text-center">
                    <Tooltip content="When disabled, actions require manual approval in the Pending tab.">
                      <span>Automated</span>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tooltip content="Apply rule to email threads">
                      <span>Threads</span>
                    </Tooltip>
                  </TableHead>
                  {/* <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Executed</TableHead> */}
                  <TableHead>
                    <span className="sr-only">User Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data
                  ?.sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0))
                  .map((rule) => (
                    <TableRow
                      key={rule.id}
                      className={!rule.enabled ? "bg-muted opacity-60" : ""}
                    >
                      <TableCell className="font-medium">
                        <Link href={`/automation/rule/${rule.id}`}>
                          {!rule.enabled && (
                            <Badge color="red" className="mr-2">
                              Disabled
                            </Badge>
                          )}
                          {rule.trackReplies ? (
                            <Tooltip content="This is the rule used by Reply Zero">
                              <Badge color="blue" className="mr-2">
                                {rule.name}
                                <InfoIcon className="ml-1 size-3" />
                              </Badge>
                            </Tooltip>
                          ) : (
                            rule.name
                          )}
                        </Link>

                        {!rule.enabled && (
                          <div>
                            <Button
                              size="xs"
                              className="mt-2"
                              onClick={async () => {
                                const result = await setRuleEnabledAction({
                                  ruleId: rule.id,
                                  enabled: true,
                                });
                                if (isActionError(result)) {
                                  toastError({
                                    description: `There was an error enabling your rule. ${result.error}`,
                                  });
                                } else {
                                  toastSuccess({
                                    description: "Rule enabled!",
                                  });
                                }
                                mutate();
                              }}
                            >
                              Enable
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap">
                        {conditionsToString(rule)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <SecurityAlert rule={rule} />
                          {conditionTypesToString(rule)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Actions actions={rule.actions} />
                      </TableCell>
                      <TableCell>
                        <Toggle
                          enabled={rule.automate}
                          name="automate"
                          onChange={async () => {
                            const result = await setRuleAutomatedAction({
                              ruleId: rule.id,
                              automate: !rule.automate,
                            });
                            if (isActionError(result)) {
                              toastError({
                                description: `There was an error updating your rule. ${result.error}`,
                              });
                            }
                            mutate();
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Toggle
                          enabled={rule.runOnThreads}
                          name="runOnThreads"
                          onChange={async () => {
                            const result = await setRuleRunOnThreadsAction({
                              ruleId: rule.id,
                              runOnThreads: !rule.runOnThreads,
                            });
                            if (isActionError(result)) {
                              toastError({
                                description: `There was an error updating your rule. ${result.error}`,
                              });
                            }
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
                            {/* TODO: multiple condition handling */}
                            {/* {!isAIRule(rule) && (
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/automation/rule/${rule.id}/examples`}
                                >
                                  View Examples
                                </Link>
                              </DropdownMenuItem>
                            )} */}
                            <DropdownMenuItem asChild>
                              <Link href={`/automation/rule/${rule.id}`}>
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                const yes = confirm(
                                  "Are you sure you want to delete this rule?",
                                );
                                if (yes) {
                                  const result = await deleteRuleAction({
                                    ruleId: rule.id,
                                  });

                                  if (isActionError(result)) {
                                    toastError({
                                      description: `There was an error deleting your rule. ${result.error}`,
                                    });
                                  }

                                  mutate();
                                }
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
            <NoRules />
          )}
        </LoadingContent>
      </Card>

      {hasRules && (
        <div className="my-2 flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link href="/automation?tab=prompt">
              <PenIcon className="mr-2 hidden h-4 w-4 md:block" />
              Add Rule via Prompt
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/automation/rule/create">
              <PlusIcon className="mr-2 hidden h-4 w-4 md:block" />
              Add Rule Manually
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function Actions({ actions }: { actions: RulesResponse[number]["actions"] }) {
  return (
    <div className="flex flex-1 space-x-2">
      {actions?.map((action) => {
        return (
          <Badge
            key={action.id}
            color={getActionColor(action.type)}
            className="text-nowrap"
          >
            {capitalCase(action.type)}
          </Badge>
        );
      })}
    </div>
  );
}

function NoRules() {
  return (
    <>
      <CardHeader>
        <CardTitle>AI Personal Assistant</CardTitle>
        <CardDescription>
          Set up intelligent automations to let our AI handle your emails for
          you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/automation?tab=prompt">
              <PenIcon className="mr-2 hidden h-4 w-4 md:block" />
              Set Prompt
            </Link>
          </Button>

          <Button type="button" variant="outline" asChild>
            <Link href="/automation/rule/create">Create a Rule Manually</Link>
          </Button>
        </div>
      </CardContent>
    </>
  );
}

function SecurityAlert({ rule }: { rule: RulesResponse[number] }) {
  const { level, message } = getRiskLevel(rule);

  if (level === "low") return null;

  return (
    <Tooltip content={message}>
      <AlertTriangleIcon className={cn("h-4 w-4", getRiskLevelColor(level))} />
    </Tooltip>
  );
}

function getRiskLevelColor(level: RiskLevel) {
  switch (level) {
    case "low":
      return null;
    case "medium":
      return "text-yellow-500";
    case "high":
      return "text-orange-500";
    case "very-high":
      return "text-red-500";
  }
}
