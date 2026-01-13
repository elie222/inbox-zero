"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  MoreHorizontalIcon,
  PenIcon,
  PlusIcon,
  HistoryIcon,
  Trash2Icon,
  SparklesIcon,
  CopyIcon,
} from "lucide-react";
import { useMemo } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Switch } from "@/components/ui/switch";
import { deleteRuleAction, toggleRuleAction } from "@/utils/actions/rule";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { toastError } from "@/components/Toast";
import { useRules } from "@/hooks/useRules";
import { LogicalOperator } from "@/generated/prisma/enums";
import type { ActionType } from "@/generated/prisma/client";
import { useAction } from "next-safe-action/hooks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { sortActionsByPriority } from "@/utils/action-sort";
import { getActionDisplay, getActionIcon } from "@/utils/action-display";
import { RuleDialog } from "./RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { useChat } from "@/providers/ChatProvider";
import { useSidebar } from "@/components/ui/sidebar";
import { useLabels } from "@/hooks/useLabels";
import { conditionsToString } from "@/utils/condition";
import { TruncatedTooltipText } from "@/components/TruncatedTooltipText";
import {
  getRuleConfig,
  SYSTEM_RULE_ORDER,
  getDefaultActions,
} from "@/utils/rule/consts";
import {
  STEP_KEYS,
  getStepNumber,
} from "@/app/(app)/[emailAccountId]/onboarding/steps";

export function Rules({
  showAddRuleButton = true,
}: {
  showAddRuleButton?: boolean;
}) {
  const { data, isLoading, error, mutate } = useRules();
  const { setOpen } = useSidebar();
  const { setInput } = useChat();

  const { userLabels } = useLabels();
  const ruleDialog = useDialogState<{
    ruleId?: string;
    editMode?: boolean;
    duplicateRule?: RulesResponse[number];
  }>();
  const onCreateRule = () => ruleDialog.onOpen();

  const { emailAccountId, provider } = useAccount();
  const { executeAsync: toggleRule } = useAction(
    toggleRuleAction.bind(null, emailAccountId),
  );
  const { executeAsync: deleteRule } = useAction(
    deleteRuleAction.bind(null, emailAccountId),
    {
      onSettled: () => mutate(),
    },
  );

  const rules: RulesResponse = useMemo(() => {
    const existingRules = data || [];

    const systemRulePlaceholders = SYSTEM_RULE_ORDER.map((systemType) => {
      const existingRule = existingRules.find(
        (r) => r.systemType === systemType,
      );
      if (existingRule) return existingRule;

      const ruleConfiguration = getRuleConfig(systemType);

      return {
        id: `placeholder-${systemType}`,
        name: ruleConfiguration.name,
        instructions: ruleConfiguration.instructions,
        enabled: false,
        runOnThreads: false,
        automate: true,
        actions: getDefaultActions(systemType, provider),
        group: null,
        emailAccountId: emailAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
        categoryFilterType: null,
        conditionalOperator: LogicalOperator.OR,
        groupId: null,
        systemType,
        to: null,
        from: null,
        subject: null,
        body: null,
        promptText: null,
      };
    });

    const userRules = existingRules.filter((rule) => !rule.systemType);

    return [...systemRulePlaceholders, ...userRules].sort(
      (a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0),
    );
  }, [data, emailAccountId, provider]);

  const hasRules = !!rules?.length;

  return (
    <div className="space-y-6">
      <Card>
        <LoadingContent loading={isLoading} error={error}>
          {hasRules ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 px-2 sm:px-4">Enabled</TableHead>
                  <TableHead className="px-2 sm:px-4">Name</TableHead>
                  <TableHead className="hidden sm:table-cell px-2 sm:px-4">
                    Prompt
                  </TableHead>
                  <TableHead className="px-2 sm:px-4">Action</TableHead>
                  <TableHead className="w-fit whitespace-nowrap px-1">
                    {showAddRuleButton && (
                      <div className="flex justify-end">
                        <div className="my-2">
                          <Button size="sm" onClick={onCreateRule}>
                            <PlusIcon className="mr-2 hidden size-4 md:block" />
                            Add Rule
                          </Button>
                        </div>
                      </div>
                    )}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => {
                  const isPlaceholder = rule.id.startsWith("placeholder-");

                  return (
                    <TableRow
                      key={rule.id}
                      className={`${!rule.enabled ? "bg-muted opacity-60" : ""} ${
                        isPlaceholder ? "cursor-default" : "cursor-pointer"
                      }`}
                      onClick={() => {
                        if (isPlaceholder) return;
                        ruleDialog.onOpen({
                          ruleId: rule.id,
                          editMode: false,
                        });
                      }}
                    >
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="text-center p-2 sm:p-4"
                      >
                        <Switch
                          size="sm"
                          checked={rule.enabled}
                          onCheckedChange={async (enabled) => {
                            const isSystemRule = !!rule.systemType;

                            // Optimistic update
                            mutate(
                              data?.map((r) =>
                                isSystemRule
                                  ? r.systemType === rule.systemType
                                    ? { ...r, enabled }
                                    : r
                                  : r.id === rule.id
                                    ? { ...r, enabled }
                                    : r,
                              ),
                              { revalidate: false },
                            );

                            const result = await toggleRule({
                              ruleId: isSystemRule ? undefined : rule.id,
                              systemType: rule.systemType || undefined,
                              enabled,
                            });

                            if (result?.serverError) {
                              toastError({
                                description: `There was an error ${
                                  enabled ? "enabling" : "disabling"
                                } your rule. ${result.serverError || ""}`,
                              });
                            }

                            // Revalidate to sync with server
                            mutate();
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium p-2 sm:p-4">
                        {rule.name}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell p-2 sm:p-4">
                        <TruncatedTooltipText
                          text={conditionsToString(rule)}
                          maxLength={50}
                          className="max-w-xs"
                        />
                      </TableCell>
                      <TableCell className="p-2 sm:p-4">
                        <ActionBadges
                          actions={rule.actions}
                          provider={provider}
                          labels={userLabels}
                        />
                      </TableCell>
                      <TableCell className="w-fit whitespace-nowrap text-center px-1 py-2">
                        {!isPlaceholder && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                aria-haspopup="true"
                                size="icon"
                                variant="ghost"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon className="size-4" />
                                <span className="sr-only">Toggle menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DropdownMenuItem
                                onClick={() => {
                                  ruleDialog.onOpen({
                                    ruleId: rule.id,
                                    editMode: true,
                                  });
                                }}
                              >
                                <PenIcon className="mr-2 size-4" />
                                Edit manually
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setInput(
                                    `I'd like to edit the "${rule.name}" rule:\n`,
                                  );
                                  setOpen((arr) => [...arr, "chat-sidebar"]);
                                }}
                              >
                                <SparklesIcon className="mr-2 size-4" />
                                Edit via AI
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  ruleDialog.onOpen({
                                    duplicateRule: rule,
                                  });
                                }}
                              >
                                <CopyIcon className="mr-2 size-4" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  href={prefixPath(
                                    emailAccountId,
                                    `/automation?tab=history&ruleId=${rule.id}`,
                                  )}
                                >
                                  <HistoryIcon className="mr-2 size-4" />
                                  History
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                onClick={async () => {
                                  const yes = confirm(
                                    `Are you sure you want to delete the rule "${rule.name}"?`,
                                  );
                                  if (yes) {
                                    toast.promise(
                                      async () => {
                                        const res = await deleteRule({
                                          id: rule.id,
                                        });

                                        if (
                                          res?.serverError ||
                                          res?.validationErrors
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
                                <Trash2Icon className="mr-2 size-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <NoRules />
          )}
        </LoadingContent>
      </Card>

      <RuleDialog
        ruleId={ruleDialog.data?.ruleId}
        duplicateRule={ruleDialog.data?.duplicateRule}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        onSuccess={() => {
          mutate();
          ruleDialog.onClose();
        }}
        editMode={ruleDialog.data?.editMode}
      />
    </div>
  );
}

export function ActionBadges({
  actions,
  provider,
  labels,
}: {
  actions: {
    id: string;
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
  }[];
  provider: string;
  labels: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="flex gap-1 sm:gap-2 flex-wrap min-w-0 justify-start">
      {sortActionsByPriority(actions).map((action) => {
        const Icon = getActionIcon(action.type);

        return (
          <Badge
            key={action.id}
            color={getActionColor(action.type)}
            className="w-fit sm:text-nowrap shrink-0"
          >
            <Icon className="size-3 mr-1.5 hidden sm:block" />
            {getActionDisplay(action, provider, labels)}
          </Badge>
        );
      })}
    </div>
  );
}

function NoRules() {
  const { emailAccountId } = useAccount();

  return (
    <CardHeader>
      <CardDescription className="flex flex-col items-center gap-4 py-20">
        You don't have any rules yet.
        <div>
          <Button asChild size="sm">
            <Link
              href={prefixPath(
                emailAccountId,
                `/onboarding?step=${getStepNumber(STEP_KEYS.LABELS)}`,
              )}
            >
              Set up default rules
            </Link>
          </Button>
        </div>
      </CardDescription>
    </CardHeader>
  );
}
