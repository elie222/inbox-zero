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
} from "lucide-react";
import { useMemo } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
import { inboxZeroLabels } from "@/utils/label";
import { isDefined } from "@/utils/types";
import { useAssistantNavigation } from "@/hooks/useAssistantNavigation";
import { getActionDisplay } from "@/utils/action-display";
import { RuleDialog } from "./RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { ColdEmailDialog } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailDialog";

const COLD_EMAIL_BLOCKER_RULE_ID = "cold-email-blocker-rule";

export function Rules({ size = "md" }: { size?: "sm" | "md" }) {
  const { data, isLoading, error, mutate } = useRules();
  const { data: emailAccountData } = useEmailAccountFull();
  const ruleDialog = useDialogState<{ ruleId: string; editMode?: boolean }>();
  const coldEmailDialog = useDialogState();

  const { emailAccountId } = useAccount();
  const { createAssistantUrl } = useAssistantNavigation(emailAccountId);
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
      name: "Cold Emails",
      instructions: emailAccountData?.coldEmailPrompt || null,
      automate: true,
      enabled: true,
      runOnThreads: false,
      actions: [
        {
          id: "cold-email-blocker-label",
          type: ActionType.LABEL,
          label: inboxZeroLabels.cold_email.name.split("/")[1],
          createdAt: new Date(),
          updatedAt: new Date(),
          ruleId: COLD_EMAIL_BLOCKER_RULE_ID,
          to: null,
          subject: null,
          content: null,
          cc: null,
          bcc: null,
          url: null,
        },
        showArchiveAction
          ? {
              id: "cold-email-blocker-archive",
              type: ActionType.ARCHIVE,
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
  }, [baseRules, emailAccountData, emailAccountId]);

  const hasRules = !!rules?.length;

  return (
    <div className="pb-4">
      <Card>
        <LoadingContent loading={isLoading} error={error}>
          {hasRules ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {size === "md" && <TableHead>Condition</TableHead>}
                  <TableHead>Action</TableHead>
                  {/* {size === "md" && (
                    <TableHead>
                      <div className="flex items-center justify-center gap-1">
                        <span>Threads</span>
                        <ThreadsExplanation size="sm" />
                      </div>
                    </TableHead>
                  )} */}
                  <TableHead>
                    <span className="sr-only">User Actions</span>
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
                    >
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => {
                            if (isColdEmailBlocker) {
                              coldEmailDialog.open();
                            } else {
                              ruleDialog.open({
                                ruleId: rule.id,
                                editMode: false,
                              });
                            }
                          }}
                          className="flex items-center gap-2 text-left hover:underline"
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
                        <ActionBadges actions={rule.actions} />
                      </TableCell>
                      {/* {size === "md" && (
                        <TableCell>
                          <div className="flex justify-center">
                            <Toggle
                              enabled={rule.runOnThreads}
                              name="runOnThreads"
                              onChange={async () => {
                                if (isColdEmailBlocker) return;

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
                      )} */}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-haspopup="true"
                              size="icon"
                              variant="ghost"
                            >
                              <MoreHorizontalIcon className="size-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                if (isColdEmailBlocker) {
                                  coldEmailDialog.open();
                                } else {
                                  ruleDialog.open({
                                    ruleId: rule.id,
                                    editMode: true,
                                  });
                                }
                              }}
                            >
                              <PenIcon className="mr-2 size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                href={
                                  isColdEmailBlocker
                                    ? prefixPath(
                                        emailAccountId,
                                        "/cold-email-blocker",
                                      )
                                    : createAssistantUrl({
                                        tab: "history",
                                        ruleId: rule.id,
                                        path: "/automation?tab=history",
                                      })
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
            <NoRules
              onCreateRule={() => {
                ruleDialog.open();
              }}
            />
          )}
        </LoadingContent>
      </Card>

      {hasRules && (
        <AddRuleButton
          onCreateRule={() => {
            ruleDialog.open();
          }}
        />
      )}

      <RuleDialog
        ruleId={ruleDialog.data?.ruleId}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.close}
        onSuccess={() => {
          mutate();
          ruleDialog.close();
        }}
        editMode={ruleDialog.data?.editMode}
      />

      <ColdEmailDialog
        isOpen={coldEmailDialog.isOpen}
        onClose={coldEmailDialog.close}
      />
    </div>
  );
}

export function ActionBadges({
  actions,
}: {
  actions: {
    id: string;
    type: ActionType;
    label?: string | null;
  }[];
}) {
  return (
    <div className="flex gap-2">
      {actions.map((action) => {
        // Hidden for simplicity
        if (action.type === ActionType.TRACK_THREAD) return null;

        return (
          <Badge
            key={action.id}
            color={getActionColor(action.type)}
            className="w-fit text-nowrap"
          >
            {getActionDisplay(action)}
          </Badge>
        );
      })}
    </div>
  );
}

function NoRules({ onCreateRule }: { onCreateRule?: () => void }) {
  return (
    <>
      <CardHeader>
        <CardDescription>
          You don't have any rules yet.
          <br />
          You can teach your AI assistant how to handle your emails by chatting
          with it or create rules manually.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddRuleButton onCreateRule={onCreateRule} />
      </CardContent>
    </>
  );
}

function AddRuleButton({ onCreateRule }: { onCreateRule?: () => void }) {
  return (
    <div className="my-2">
      <Button size="sm" onClick={onCreateRule}>
        <PlusIcon className="mr-2 hidden size-4 md:block" />
        Add Rule
      </Button>
    </div>
  );
}
