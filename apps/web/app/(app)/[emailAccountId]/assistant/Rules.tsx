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
} from "lucide-react";
import { useMemo } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { setRuleEnabledAction } from "@/utils/actions/ai-rule";
import { deleteRuleAction } from "@/utils/actions/rule";
import { updateColdEmailSettingsAction } from "@/utils/actions/cold-email";
import { conditionsToString } from "@/utils/condition";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { toastError } from "@/components/Toast";
import { useRules } from "@/hooks/useRules";
import { ActionType, ColdEmailSetting, LogicalOperator } from "@prisma/client";
import { useAction } from "next-safe-action/hooks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { ExpandableText } from "@/components/ExpandableText";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { sortActionsByPriority } from "@/utils/action-sort";
import { inboxZeroLabels } from "@/utils/label";
import { isDefined } from "@/utils/types";
import { getActionDisplay, getActionIcon } from "@/utils/action-display";
import { RuleDialog } from "./RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { ColdEmailDialog } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailDialog";
import { useChat } from "@/providers/ChatProvider";
import { useSidebar } from "@/components/ui/sidebar";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { useLabels } from "@/hooks/useLabels";
import {
  CONVERSATION_STATUSES,
  isConversationStatusType,
  type ThreadStatus,
} from "@/utils/reply-tracker/conversation-status-config";
import { toggleConversationStatusAction } from "@/utils/actions/rule";

const COLD_EMAIL_BLOCKER_RULE_ID = "cold-email-blocker-rule";

function getSystemRuleDescription(
  systemType: string | null,
  isColdEmailBlocker: boolean,
) {
  if (isColdEmailBlocker) {
    return {
      condition: "Block cold emails",
      tooltip:
        "Uses AI to detect and automatically handle unsolicited outreach emails",
    };
  }

  switch (systemType) {
    case "TO_REPLY":
      return {
        condition: "Emails needing your direct response",
        tooltip:
          "Tracks emails where someone is waiting for your reply. Excludes automated notifications, bulk emails, and newsletters.",
      };
    case "FYI":
      return {
        condition: "Important emails that don't need a response",
        tooltip:
          "Tracks emails that need your attention but don't require you or the other person to reply. Useful for keeping informed without action items.",
      };
    case "AWAITING_REPLY":
      return {
        condition: "Emails you're expecting a reply to",
        tooltip:
          "Tracks emails where you've replied and are waiting for the other person to respond back.",
      };
    case "ACTIONED":
      return {
        condition: "Resolved email threads",
        tooltip:
          "Marks email threads as complete with nothing left to do. Useful for keeping track of finished conversations.",
      };
    default:
      return null;
  }
}

export function Rules({
  size = "md",
  showAddRuleButton = true,
}: {
  size?: "sm" | "md";
  showAddRuleButton?: boolean;
}) {
  const { data, isLoading, error, mutate } = useRules();
  const { setOpen } = useSidebar();
  const { setInput } = useChat();
  const { data: emailAccountData, mutate: mutateEmailAccount } =
    useEmailAccountFull();
  const { userLabels } = useLabels();
  const ruleDialog = useDialogState<{ ruleId: string; editMode?: boolean }>();
  const coldEmailDialog = useDialogState();

  const onCreateRule = () => ruleDialog.onOpen();

  const { emailAccountId, provider } = useAccount();
  const { executeAsync: setRuleEnabled } = useAction(
    setRuleEnabledAction.bind(null, emailAccountId),
    {
      onSettled: () => mutate(),
    },
  );
  const { executeAsync: deleteRule } = useAction(
    deleteRuleAction.bind(null, emailAccountId),
    {
      onSettled: () => mutate(),
    },
  );
  const { executeAsync: updateColdEmailSettings } = useAction(
    updateColdEmailSettingsAction.bind(null, emailAccountId),
  );

  const baseRules: RulesResponse = useMemo(() => {
    const existingRules = data || [];

    // Create placeholder entries for conversation status rules that don't exist
    const conversationStatusPlaceholders = CONVERSATION_STATUSES.map(
      (status) => {
        const existingRule = existingRules.find(
          (r) => r.systemType === status.systemType,
        );
        if (existingRule) return existingRule;

        // Create placeholder for missing conversation status rule
        return {
          id: `placeholder-${status.systemType}`,
          name: status.name,
          instructions: status.description,
          enabled: false,
          runOnThreads: false,
          automate: true,
          actions: [],
          categoryFilters: [],
          group: null,
          emailAccountId: emailAccountId,
          createdAt: new Date(),
          updatedAt: new Date(),
          categoryFilterType: null,
          conditionalOperator: LogicalOperator.OR,
          groupId: null,
          systemType: status.systemType,
          to: null,
          from: null,
          subject: null,
          body: null,
          promptText: null,
        };
      },
    );

    // Get non-conversation-status rules
    const otherRules = existingRules.filter(
      (rule) => !isConversationStatusType(rule.systemType),
    );

    // Combine and sort: enabled first, then conversation status rules at the top
    return [...conversationStatusPlaceholders, ...otherRules].sort(
      (a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0),
    );
  }, [data, emailAccountId]);

  const rules: RulesResponse = useMemo(() => {
    const enabledSettings: ColdEmailSetting[] = [
      ColdEmailSetting.LABEL,
      ColdEmailSetting.ARCHIVE_AND_LABEL,
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
    ];

    const shouldArchived: ColdEmailSetting[] = [
      ColdEmailSetting.ARCHIVE_AND_LABEL,
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
    ];

    const coldEmailBlockerEnabled =
      emailAccountData?.coldEmailBlocker &&
      enabledSettings.includes(emailAccountData?.coldEmailBlocker);

    const showArchiveAction =
      emailAccountData?.coldEmailBlocker &&
      shouldArchived.includes(emailAccountData?.coldEmailBlocker);

    // Always show cold email blocker rule, works differently to rules but we want to show it in the list for user simplicity
    const coldEmailBlockerRule: RulesResponse[number] = {
      id: COLD_EMAIL_BLOCKER_RULE_ID,
      name: "Cold Email",
      instructions: emailAccountData?.coldEmailPrompt || null,
      enabled: !!coldEmailBlockerEnabled,
      runOnThreads: false,
      automate: true,
      actions: coldEmailBlockerEnabled
        ? [
            isGoogleProvider(provider)
              ? {
                  id: "cold-email-blocker-label",
                  type: ActionType.LABEL,
                  label: inboxZeroLabels.cold_email.name,
                  labelId: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  ruleId: COLD_EMAIL_BLOCKER_RULE_ID,
                  to: null,
                  subject: null,
                  content: null,
                  cc: null,
                  bcc: null,
                  url: null,
                  folderName: null,
                  folderId: null,
                  delayInMinutes: null,
                }
              : null,
            showArchiveAction
              ? {
                  id: "cold-email-blocker-archive",
                  type: isMicrosoftProvider(provider)
                    ? ActionType.MOVE_FOLDER
                    : ActionType.ARCHIVE,
                  label: null,
                  labelId: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  ruleId: COLD_EMAIL_BLOCKER_RULE_ID,
                  to: null,
                  subject: null,
                  content: null,
                  cc: null,
                  bcc: null,
                  url: null,
                  folderName: null,
                  folderId: null,
                  delayInMinutes: null,
                }
              : null,
            emailAccountData?.coldEmailDigest
              ? {
                  id: "cold-email-blocker-digest",
                  type: ActionType.DIGEST,
                  label: null,
                  labelId: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  ruleId: COLD_EMAIL_BLOCKER_RULE_ID,
                  to: null,
                  subject: null,
                  content: null,
                  cc: null,
                  bcc: null,
                  url: null,
                  folderName: null,
                  folderId: null,
                  delayInMinutes: null,
                }
              : null,
          ].filter(isDefined)
        : [],
      categoryFilters: [],
      group: null,
      emailAccountId: emailAccountId,
      createdAt: new Date(),
      updatedAt: new Date(),
      categoryFilterType: null,
      conditionalOperator: LogicalOperator.OR,
      groupId: null,
      systemType: null,
      to: null,
      from: null,
      subject: null,
      body: null,
      promptText: null,
    };
    return [...(baseRules || []), coldEmailBlockerRule];
  }, [baseRules, emailAccountData, emailAccountId, provider]);

  const hasRules = !!rules?.length;

  const { executeAsync: toggleConversationStatus } = useAction(
    toggleConversationStatusAction.bind(null, emailAccountId),
  );

  return (
    <div className="space-y-6">
      <Card>
        <LoadingContent loading={isLoading} error={error}>
          {hasRules ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Enabled</TableHead>
                  <TableHead>Name</TableHead>
                  {size === "md" && <TableHead>Condition</TableHead>}
                  <TableHead>Action</TableHead>
                  <TableHead>
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
                  const isColdEmailBlocker =
                    rule.id === COLD_EMAIL_BLOCKER_RULE_ID;
                  const isConversationStatus = isConversationStatusType(
                    rule.systemType,
                  );
                  const isPlaceholder = rule.id.startsWith("placeholder-");

                  return (
                    <TableRow
                      key={rule.id}
                      className={!rule.enabled ? "bg-muted opacity-60" : ""}
                      onClick={() => {
                        if (isColdEmailBlocker) {
                          coldEmailDialog.onOpen();
                        } else if (!isPlaceholder) {
                          ruleDialog.onOpen({
                            ruleId: rule.id,
                            editMode: false,
                          });
                        }
                      }}
                    >
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="text-center"
                      >
                        <Switch
                          size="sm"
                          checked={rule.enabled}
                          onCheckedChange={async (enabled) => {
                            // Handle cold email blocker separately
                            if (isColdEmailBlocker) {
                              const result = await updateColdEmailSettings({
                                coldEmailBlocker: enabled
                                  ? ColdEmailSetting.ARCHIVE_AND_LABEL
                                  : ColdEmailSetting.DISABLED,
                              });

                              if (result?.serverError) {
                                toastError({
                                  description: `There was an error ${
                                    enabled ? "enabling" : "disabling"
                                  } cold email blocker. ${result.serverError || ""}`,
                                });
                              }

                              // Revalidate to sync with server
                              mutate();
                              mutateEmailAccount();
                              return;
                            }

                            // Optimistic update
                            mutate(
                              data?.map((r) =>
                                isConversationStatus
                                  ? r.systemType === rule.systemType
                                    ? { ...r, enabled }
                                    : r
                                  : r.id === rule.id
                                    ? { ...r, enabled }
                                    : r,
                              ),
                              { revalidate: false },
                            );

                            const result = isConversationStatus
                              ? await toggleConversationStatus({
                                  systemType: rule.systemType as ThreadStatus,
                                  enabled,
                                })
                              : await setRuleEnabled({
                                  ruleId: rule.id,
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
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isColdEmailBlocker) {
                              coldEmailDialog.onOpen();
                            } else if (!isPlaceholder) {
                              ruleDialog.onOpen({
                                ruleId: rule.id,
                                editMode: false,
                              });
                            }
                          }}
                          className="text-left"
                        >
                          {rule.name}
                        </button>
                      </TableCell>
                      {size === "md" && (
                        <TableCell>
                          {(() => {
                            const systemRuleDesc = getSystemRuleDescription(
                              rule.systemType,
                              isColdEmailBlocker,
                            );
                            if (systemRuleDesc) {
                              return (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">
                                    {systemRuleDesc.condition}
                                  </span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <InfoIcon className="size-3.5 text-green-600 dark:text-green-500 flex-shrink-0 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="right"
                                      className="max-w-xs"
                                    >
                                      <p>{systemRuleDesc.tooltip}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              );
                            }
                            return (
                              <ExpandableText
                                text={conditionsToString(rule)}
                                className="max-w-xs"
                              />
                            );
                          })()}
                        </TableCell>
                      )}
                      <TableCell>
                        <ActionBadges
                          actions={rule.actions}
                          provider={provider}
                          labels={userLabels}
                        />
                      </TableCell>
                      <TableCell className="text-center">
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
                                  if (isColdEmailBlocker) {
                                    coldEmailDialog.onOpen();
                                  } else {
                                    ruleDialog.onOpen({
                                      ruleId: rule.id,
                                      editMode: true,
                                    });
                                  }
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
                              <DropdownMenuItem asChild>
                                <Link
                                  href={
                                    isColdEmailBlocker
                                      ? prefixPath(
                                          emailAccountId,
                                          "/cold-email-blocker",
                                        )
                                      : prefixPath(
                                          emailAccountId,
                                          `/automation?tab=history&ruleId=${rule.id}`,
                                        )
                                  }
                                  target={
                                    isColdEmailBlocker ? "_blank" : undefined
                                  }
                                >
                                  <HistoryIcon className="mr-2 size-4" />
                                  History
                                </Link>
                              </DropdownMenuItem>
                              {!isColdEmailBlocker && !isConversationStatus && (
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
                                  <Trash2Icon className="mr-2 size-4" />
                                  Delete
                                </DropdownMenuItem>
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
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        onSuccess={() => {
          mutate();
          ruleDialog.onClose();
        }}
        editMode={ruleDialog.data?.editMode}
      />

      <ColdEmailDialog
        isOpen={coldEmailDialog.isOpen}
        onClose={coldEmailDialog.onClose}
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
    <div className="flex gap-2 flex-wrap">
      {sortActionsByPriority(actions).map((action) => {
        // Hidden for simplicity
        if (action.type === ActionType.TRACK_THREAD) return null;

        const Icon = getActionIcon(action.type);

        return (
          <Badge
            key={action.id}
            color={getActionColor(action.type)}
            className="w-fit text-nowrap"
          >
            <Icon className="size-3 mr-1.5" />
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
            <Link href={prefixPath(emailAccountId, "/assistant/onboarding")}>
              Set up default rules
            </Link>
          </Button>
        </div>
      </CardDescription>
    </CardHeader>
  );
}
