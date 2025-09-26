"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  MoreHorizontalIcon,
  PenIcon,
  PlusIcon,
  HistoryIcon,
  Trash2Icon,
  ToggleRightIcon,
  ToggleLeftIcon,
  InfoIcon,
  SparklesIcon,
  EyeIcon,
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
import { setRuleEnabledAction } from "@/utils/actions/ai-rule";
import { deleteRuleAction } from "@/utils/actions/rule";
import { conditionsToString } from "@/utils/condition";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
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

const COLD_EMAIL_BLOCKER_RULE_ID = "cold-email-blocker-rule";

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
  const { data: emailAccountData } = useEmailAccountFull();
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

  const baseRules: RulesResponse = useMemo(() => {
    return (
      data?.sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)) || []
    );
  }, [data]);

  const rules: RulesResponse = useMemo(() => {
    const enabled: ColdEmailSetting[] = [
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
      enabled.includes(emailAccountData?.coldEmailBlocker);

    if (!coldEmailBlockerEnabled) return baseRules;

    const showArchiveAction =
      emailAccountData?.coldEmailBlocker &&
      shouldArchived.includes(emailAccountData?.coldEmailBlocker);

    // Works differently to rules, but we want to show it in the list for user simplicity
    const coldEmailBlockerRule: RulesResponse[number] = {
      id: COLD_EMAIL_BLOCKER_RULE_ID,
      name: "Cold Email",
      instructions: emailAccountData?.coldEmailPrompt || null,
      automate: true,
      enabled: true,
      runOnThreads: false,
      actions: [
        isGoogleProvider(provider)
          ? {
              id: "cold-email-blocker-label",
              type: ActionType.LABEL,
              label: inboxZeroLabels.cold_email.name,
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
      ].filter(isDefined),
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

  return (
    <div>
      <Card>
        <LoadingContent loading={isLoading} error={error}>
          {hasRules ? (
            <Table>
              <TableHeader>
                <TableRow>
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

                  return (
                    <TableRow
                      key={rule.id}
                      className={!rule.enabled ? "bg-muted opacity-60" : ""}
                      onClick={() => {
                        if (isColdEmailBlocker) {
                          coldEmailDialog.onOpen();
                        } else {
                          ruleDialog.onOpen({
                            ruleId: rule.id,
                            editMode: false,
                          });
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isColdEmailBlocker) {
                              coldEmailDialog.onOpen();
                            } else {
                              ruleDialog.onOpen({
                                ruleId: rule.id,
                                editMode: false,
                              });
                            }
                          }}
                          className="flex items-center gap-2 text-left"
                        >
                          {!rule.enabled && (
                            <Badge color="red" className="mr-2">
                              Disabled
                            </Badge>
                          )}
                          {rule.name}
                          {!rule.automate && (
                            <Tooltip content="Actions for matched emails will require manual approval in the 'Pending' tab. You can change this in the rule settings by clicking this badge.">
                              <Badge
                                color="yellow"
                                className="ml-auto text-nowrap"
                              >
                                Requires Approval
                                <InfoIcon className="ml-1.5 size-3" />
                              </Badge>
                            </Tooltip>
                          )}
                        </button>
                      </TableCell>
                      {size === "md" && (
                        <TableCell>
                          <ExpandableText
                            text={conditionsToString(rule)}
                            className="max-w-xs"
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <ActionBadges
                          actions={rule.actions}
                          provider={provider}
                        />
                      </TableCell>
                      <TableCell className="text-center">
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
                            {!isColdEmailBlocker && (
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
                            {!isColdEmailBlocker && (
                              <>
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const result = await setRuleEnabled({
                                      ruleId: rule.id,
                                      enabled: !rule.enabled,
                                    });

                                    if (result?.serverError) {
                                      toastError({
                                        description: `There was an error ${
                                          rule.enabled
                                            ? "disabling"
                                            : "enabling"
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
                                  {rule.enabled ? (
                                    <ToggleRightIcon className="mr-2 size-4" />
                                  ) : (
                                    <ToggleLeftIcon className="mr-2 size-4" />
                                  )}
                                  {rule.enabled ? "Disable" : "Enable"}
                                </DropdownMenuItem>
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
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
}: {
  actions: {
    id: string;
    type: ActionType;
    label?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
  }[];
  provider: string;
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
            {getActionDisplay(action, provider)}
          </Badge>
        );
      })}
    </div>
  );
}

function NoRules() {
  return (
    <CardHeader>
      <CardDescription>You don't have any rules yet.</CardDescription>
    </CardHeader>
  );
}
