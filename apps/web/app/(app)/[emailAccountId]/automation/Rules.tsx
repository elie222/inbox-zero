"use client";

import Link from "next/link";
import { toast } from "sonner";
import { capitalCase } from "capital-case";
import { MoreHorizontalIcon, PenIcon, PlusIcon } from "lucide-react";
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
  setRuleRunOnThreadsAction,
  setRuleEnabledAction,
} from "@/utils/actions/ai-rule";
import { deleteRuleAction } from "@/utils/actions/rule";
import { Toggle } from "@/components/Toggle";
import { conditionsToString } from "@/utils/condition";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import type { RiskLevel } from "@/utils/risk";
import { useRules } from "@/hooks/useRules";
import { ActionType } from "@prisma/client";
import { ThreadsExplanation } from "@/app/(app)/[emailAccountId]/automation/RuleForm";
import { useAction } from "next-safe-action/hooks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export function Rules() {
  const { data, isLoading, error, mutate } = useRules();

  const hasRules = !!data?.length;

  const { emailAccountId } = useAccount();
  const { executeAsync: setRuleRunOnThreads } = useAction(
    setRuleRunOnThreadsAction.bind(null, emailAccountId),
  );
  const { executeAsync: setRuleEnabled } = useAction(
    setRuleEnabledAction.bind(null, emailAccountId),
  );
  const { executeAsync: deleteRule } = useAction(
    deleteRuleAction.bind(null, emailAccountId),
  );

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
                  <TableHead>Actions</TableHead>
                  <TableHead>
                    <div className="flex items-center justify-center gap-1">
                      <span>Threads</span>
                      <ThreadsExplanation size="sm" />
                    </div>
                  </TableHead>
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
                        <Link
                          href={prefixPath(
                            emailAccountId,
                            `/automation/rule/${rule.id}`,
                          )}
                          className="flex items-center gap-2"
                        >
                          {!rule.enabled && (
                            <Badge color="red" className="mr-2">
                              Disabled
                            </Badge>
                          )}
                          {rule.name}
                          {!rule.automate && (
                            <Tooltip content="Actions for matched emails will require manual approval in the 'Pending' tab.">
                              <Badge
                                color="yellow"
                                className="ml-auto text-nowrap"
                              >
                                Requires Approval
                              </Badge>
                            </Tooltip>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap">
                        {conditionsToString(rule)}
                      </TableCell>
                      <TableCell>
                        <Actions actions={rule.actions} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <Toggle
                            enabled={rule.runOnThreads}
                            name="runOnThreads"
                            onChange={async () => {
                              const result = await setRuleRunOnThreads({
                                ruleId: rule.id,
                                runOnThreads: !rule.runOnThreads,
                              });

                              if (result?.serverError) {
                                toastError({
                                  description: `There was an error updating your rule. ${result.serverError || ""}`,
                                });
                              }
                              mutate();
                            }}
                          />
                        </div>
                      </TableCell>
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
                              <Link
                                href={prefixPath(
                                  emailAccountId,
                                  `/automation/rule/${rule.id}`,
                                )}
                              >
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                href={prefixPath(
                                  emailAccountId,
                                  `/automation?tab=history&ruleId=${rule.id}`,
                                )}
                              >
                                History
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                const result = await setRuleEnabled({
                                  ruleId: rule.id,
                                  enabled: !rule.enabled,
                                });

                                if (result?.serverError) {
                                  toastError({
                                    description: `There was an error ${
                                      rule.enabled ? "disabling" : "enabling"
                                    } your rule. ${result.serverError || ""}`,
                                  });
                                } else {
                                  toastSuccess({
                                    description: `Rule ${
                                      rule.enabled ? "disabled" : "enabled"
                                    }!`,
                                  });
                                }

                                mutate();
                              }}
                            >
                              {rule.enabled ? "Disable" : "Enable"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                const yes = confirm(
                                  "Are you sure you want to delete this rule?",
                                );
                                if (yes) {
                                  toast.promise(
                                    async () => {
                                      const res = await deleteRule({
                                        id: rule.id,
                                      });

                                      if (
                                        res?.serverError ||
                                        res?.validationErrors ||
                                        res?.bindArgsValidationErrors
                                      ) {
                                        throw new Error(
                                          res?.serverError ||
                                            "There was an error deleting your rule",
                                        );
                                      }

                                      mutate();
                                    },
                                    {
                                      loading: "Deleting rule...",
                                      success: "Rule deleted",
                                      error: (error) =>
                                        `Error deleting rule. ${error.message}`,
                                      finally: () => {
                                        mutate();
                                      },
                                    },
                                  );
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
            <Link href={prefixPath(emailAccountId, "/automation?tab=prompt")}>
              <PenIcon className="mr-2 hidden h-4 w-4 md:block" />
              Add Rule via Prompt
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={prefixPath(emailAccountId, "/automation/rule/create")}>
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
      {actions.map((action) => {
        // Hidden for simplicity
        if (action.type === ActionType.TRACK_THREAD) return null;

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
  const { emailAccountId } = useAccount();
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
            <Link href={prefixPath(emailAccountId, "/automation?tab=prompt")}>
              <PenIcon className="mr-2 hidden h-4 w-4 md:block" />
              Set Prompt
            </Link>
          </Button>

          <Button type="button" variant="outline" asChild>
            <Link href={prefixPath(emailAccountId, "/automation/rule/create")}>
              Create a Rule Manually
            </Link>
          </Button>
        </div>
      </CardContent>
    </>
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
