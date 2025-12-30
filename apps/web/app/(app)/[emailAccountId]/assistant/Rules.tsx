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
  InfoIcon,
  CopyIcon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react";
import { useMemo, useCallback, useRef } from "react";
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
import {
  deleteRuleAction,
  toggleRuleAction,
  importRulesAction,
} from "@/utils/actions/rule";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { toastError } from "@/components/Toast";
import { useRules } from "@/hooks/useRules";
import { LogicalOperator, SystemType } from "@/generated/prisma/enums";
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
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { conditionsToString } from "@/utils/condition";
import { TruncatedTooltipText } from "@/components/TruncatedTooltipText";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const exportRules = useCallback(() => {
    if (!data) return;

    // Filter out placeholder rules and prepare export data
    const exportData = data.map((rule) => ({
      name: rule.name,
      instructions: rule.instructions,
      enabled: rule.enabled,
      automate: rule.automate,
      runOnThreads: rule.runOnThreads,
      systemType: rule.systemType,
      conditionalOperator: rule.conditionalOperator,
      // Conditions
      from: rule.from,
      to: rule.to,
      subject: rule.subject,
      body: rule.body,
      categoryFilterType: rule.categoryFilterType,
      // Actions
      actions: rule.actions.map((action) => ({
        type: action.type,
        label: action.label,
        to: action.to,
        cc: action.cc,
        bcc: action.bcc,
        subject: action.subject,
        content: action.content,
        folderName: action.folderName,
      })),
      // Group info
      group: rule.group?.name || null,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inbox-zero-rules-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Rules exported successfully");
  }, [data]);

  const importRules = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const rules = JSON.parse(text);

        // Handle both array format and object with rules property
        const rulesArray = Array.isArray(rules) ? rules : rules.rules;

        if (!Array.isArray(rulesArray) || rulesArray.length === 0) {
          toastError({ description: "Invalid rules file format" });
          return;
        }

        const result = await importRulesAction(emailAccountId, {
          rules: rulesArray,
        });

        if (result?.serverError) {
          toastError({
            title: "Import failed",
            description: result.serverError,
          });
        } else if (result?.data) {
          const { createdCount, updatedCount, skippedCount } = result.data;
          toast.success(
            `Imported ${createdCount} new, updated ${updatedCount} existing${skippedCount > 0 ? `, skipped ${skippedCount}` : ""}`,
          );
          mutate();
        }
      } catch (error) {
        toastError({
          title: "Import failed",
          description:
            error instanceof Error ? error.message : "Failed to parse file",
        });
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [emailAccountId, mutate],
  );

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
                    <div className="flex justify-end gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".json"
                        onChange={importRules}
                        className="hidden"
                      />
                      <div className="my-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <UploadIcon className="mr-2 hidden size-4 md:block" />
                          Import
                        </Button>
                      </div>
                      <div className="my-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={exportRules}
                          disabled={!data?.length}
                        >
                          <DownloadIcon className="mr-2 hidden size-4 md:block" />
                          Export
                        </Button>
                      </div>
                      {showAddRuleButton && (
                        <div className="my-2">
                          <Button size="sm" onClick={onCreateRule}>
                            <PlusIcon className="mr-2 hidden size-4 md:block" />
                            Add Rule
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => {
                  const isConversationStatus = isConversationStatusType(
                    rule.systemType,
                  );
                  const isColdEmailBlocker =
                    rule.systemType === SystemType.COLD_EMAIL;
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
                        {(() => {
                          const systemRuleDesc = getSystemRuleDescription(
                            rule.systemType,
                          );
                          if (isConversationStatus) {
                            return (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                  {systemRuleDesc?.condition || ""}
                                </span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <InfoIcon className="size-3.5 text-green-600 dark:text-green-500 flex-shrink-0 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    className="max-w-xs"
                                  >
                                    <p>
                                      System rule to track conversation status.
                                      Conditions cannot be edited.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            );
                          }
                          return (
                            <TruncatedTooltipText
                              text={conditionsToString(rule)}
                              maxLength={50}
                              className="max-w-xs"
                            />
                          );
                        })()}
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
                              {!isColdEmailBlocker && !isConversationStatus && (
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
                              )}
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
                              {!isColdEmailBlocker && !isConversationStatus && (
                                <>
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
                                </>
                              )}
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

function getSystemRuleDescription(systemType: SystemType | null) {
  switch (systemType) {
    case SystemType.TO_REPLY:
      return {
        condition: "Emails needing your direct response",
      };
    case SystemType.FYI:
      return {
        condition: "Important emails that don't need a response",
      };
    case SystemType.AWAITING_REPLY:
      return {
        condition: "Emails you're expecting a reply to",
      };
    case SystemType.ACTIONED:
      return {
        condition: "Resolved email threads",
      };
    case SystemType.COLD_EMAIL:
      return {
        condition: DEFAULT_COLD_EMAIL_PROMPT,
      };
    default:
      return null;
  }
}
