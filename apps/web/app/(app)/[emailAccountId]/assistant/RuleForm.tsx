"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { type SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePostHog } from "posthog-js/react";
import { env } from "@/env";
import {
  PencilIcon,
  TrashIcon,
  MailIcon,
  BotIcon,
  ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { TypographyH3 } from "@/components/Typography";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import {
  createRuleAction,
  deleteRuleAction,
  updateRuleAction,
} from "@/utils/actions/rule";
import {
  type CreateRuleBody,
  createRuleBody,
} from "@/utils/actions/rule.validation";
import { Toggle } from "@/components/Toggle";
import { Tooltip } from "@/components/Tooltip";
import { useLabels } from "@/hooks/useLabels";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { AlertError } from "@/components/Alert";
import { LearnedPatternsDialog } from "@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { getEmailTerminology } from "@/utils/terminology";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Form } from "@/components/ui/form";
import { cn } from "@/utils";
import { getActionIcon } from "@/utils/action-display";
import { useFolders } from "@/hooks/useFolders";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import { RuleSectionCard } from "@/app/(app)/[emailAccountId]/assistant/RuleSectionCard";
import { ConditionSteps } from "@/app/(app)/[emailAccountId]/assistant/ConditionSteps";
import { ActionSteps } from "@/app/(app)/[emailAccountId]/assistant/ActionSteps";
import { RuleLoader } from "@/app/(app)/[emailAccountId]/assistant/RuleLoader";
import {
  getAvailableActionsForRuleEditor,
  getExtraAvailableActionsForRuleEditor,
} from "@/utils/ai/rule/action-availability";
import { handleRuleAttachmentSourceSave } from "@/utils/attachments/rule";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import { getConnectedRuleNotificationChannels } from "@/utils/messaging/routes";
import { sortActionsByPriority } from "@/utils/action-sort";
import {
  denormalizeDraftReplyActions,
  normalizeDraftReplyActions,
} from "@/app/(app)/[emailAccountId]/assistant/draftReplyActions";
import { isDraftReplyActionType } from "@/utils/actions/draft-reply";

export function Rule({
  ruleId,
  alwaysEditMode = false,
}: {
  ruleId: string;
  alwaysEditMode?: boolean;
}) {
  return (
    <RuleLoader ruleId={ruleId}>
      {({ rule, mutate }) => (
        <RuleForm rule={rule} alwaysEditMode={alwaysEditMode} mutate={mutate} />
      )}
    </RuleLoader>
  );
}

export function RuleForm({
  rule,
  alwaysEditMode = false,
  onSuccess,
  isDialog = false,
  mutate,
  onCancel,
}: {
  rule: CreateRuleBody & {
    id?: string;
    attachmentSources?: Array<{
      driveConnectionId: string;
      name: string;
      sourceId: string;
      sourcePath: string | null;
      type: AttachmentSourceInput["type"];
    }>;
  };
  alwaysEditMode?: boolean;
  onSuccess?: () => void;
  isDialog?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  mutate?: (data?: any, options?: any) => void;
  onCancel?: () => void;
}) {
  const { emailAccountId, provider } = useAccount();
  const ruleEditorActions = getRuleEditorActions(rule.actions);

  const form = useForm<CreateRuleBody>({
    resolver: zodResolver(createRuleBody),
    defaultValues: rule
      ? {
          ...rule,
          digest: ruleEditorActions.some(
            (action) => action.type === ActionType.DIGEST,
          ),
          actions: [
            ...normalizeDraftReplyActions(
              sortActionsByPriority(
                ruleEditorActions
                  .filter((action) => action.type !== ActionType.DIGEST)
                  .map((action) => ({
                    ...action,
                    delayInMinutes: action.delayInMinutes,
                    content: {
                      ...action.content,
                      setManually: !!action.content?.value,
                    },
                    folderName: action.folderName,
                    folderId: action.folderId,
                  })),
              ),
            ),
          ],
        }
      : undefined,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState,
    trigger,
  } = form;

  const { errors, isSubmitting, isSubmitted } = formState;

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition,
  } = useFieldArray({
    control,
    name: "conditions",
  });
  const {
    fields: actionFields,
    append,
    remove,
    replace,
  } = useFieldArray({ control, name: "actions" });

  const { userLabels, isLoading, mutate: mutateLabels } = useLabels();
  const { data: messagingChannelsData } = useMessagingChannels(emailAccountId);
  const { folders, isLoading: foldersLoading } = useFolders(provider);
  const router = useRouter();

  const posthog = usePostHog();
  const [attachmentSources, setAttachmentSources] = useState<
    AttachmentSourceInput[]
  >(
    rule.attachmentSources?.map((source) => ({
      driveConnectionId: source.driveConnectionId,
      name: source.name,
      sourceId: source.sourceId,
      sourcePath: source.sourcePath,
      type: source.type,
    })) || [],
  );

  const onSubmit: SubmitHandler<CreateRuleBody> = useCallback(
    async (data) => {
      // set content to empty string if it's not set manually
      for (const action of data.actions) {
        if (isDraftReplyActionType(action.type)) {
          if (!action.content?.setManually) {
            action.content = { value: "", ai: false };
          }
        }
      }

      const normalizedActions = denormalizeDraftReplyActions(data.actions);

      const hasDraftAction = normalizedActions.some((action) =>
        isDraftReplyActionType(action.type),
      );

      // Add DIGEST action if digest is enabled
      const actionsToSubmit = [...normalizedActions];
      if (data.digest) {
        const existingDigestAction = rule.actions.find(
          (action) => action.type === ActionType.DIGEST,
        );

        actionsToSubmit.push({
          id: existingDigestAction?.id,
          type: ActionType.DIGEST,
        });
      }

      if (data.id) {
        const orderedActionsToSubmit = restorePersistedActionSequence({
          actions: actionsToSubmit,
          originalActions: rule.actions,
        });

        if (mutate) {
          // mutate delayInMinutes optimistically to keep the UI consistent
          // in case the modal is reopened immediately after saving
          const optimisticData = {
            rule: {
              ...rule,
              actions: rule.actions.map((action, index) => ({
                ...action,
                delayInMinutes: data.actions[index]?.delayInMinutes,
              })),
            },
          };
          mutate(optimisticData, false);
        }

        const res = await updateRuleAction(emailAccountId, {
          ...data,
          actions: orderedActionsToSubmit,
          id: data.id,
        });

        if (res?.serverError) {
          console.error(res);
          toastError({ description: res.serverError });
          if (mutate) mutate();
        } else if (!res?.data?.rule) {
          toastError({
            description: "There was an error updating the rule.",
          });
          if (mutate) mutate();
        } else {
          await handleRuleAttachmentSourceSave({
            emailAccountId,
            ruleId: res.data.rule.id,
            attachmentSources,
            shouldSave: hasDraftAction,
            successMessage: "Saved!",
            partialErrorMessage:
              "Rule saved, but draft attachment sources could not be updated.",
          });

          // Revalidate to get the real data from server
          if (mutate) mutate();
          posthog.capture("User updated AI rule", {
            conditions: data.conditions.map((condition) => condition.type),
            actions: orderedActionsToSubmit.map((action) => action.type),
            runOnThreads: data.runOnThreads,
            digest: data.digest,
          });
          if (isDialog && onSuccess) {
            onSuccess();
          } else {
            router.push(prefixPath(emailAccountId, "/automation?tab=rules"));
          }
        }
      } else {
        const res = await createRuleAction(emailAccountId, {
          ...data,
          actions: actionsToSubmit,
        });

        if (res?.serverError) {
          console.error(res);
          toastError({ description: res.serverError });
        } else if (!res?.data?.rule) {
          toastError({
            description: "There was an error creating the rule.",
          });
        } else {
          await handleRuleAttachmentSourceSave({
            emailAccountId,
            ruleId: res.data.rule.id,
            attachmentSources,
            shouldSave: hasDraftAction,
            successMessage: "Created!",
            partialErrorMessage:
              "Rule created, but draft attachment sources could not be saved.",
          });

          posthog.capture("User created AI rule", {
            conditions: data.conditions.map((condition) => condition.type),
            actions: actionsToSubmit.map((action) => action.type),
            runOnThreads: data.runOnThreads,
            digest: data.digest,
          });
          if (isDialog && onSuccess) {
            onSuccess();
          } else {
            router.replace(
              prefixPath(emailAccountId, `/assistant/rule/${res.data.rule.id}`),
            );
            router.push(prefixPath(emailAccountId, "/automation?tab=rules"));
          }
        }
      }
    },
    [
      attachmentSources,
      router,
      posthog,
      emailAccountId,
      isDialog,
      onSuccess,
      mutate,
      rule,
    ],
  );

  const conditions = watch("conditions");

  // biome-ignore lint/correctness/useExhaustiveDependencies: needed
  useEffect(() => {
    trigger("conditions");
  }, [conditions]);

  const actionErrors = useMemo(() => {
    const actionErrors: string[] = [];
    watch("actions")?.forEach((_, index) => {
      const actionError =
        formState.errors?.actions?.[index]?.url?.root?.message ||
        formState.errors?.actions?.[index]?.labelId?.root?.message ||
        formState.errors?.actions?.[index]?.to?.root?.message ||
        formState.errors?.actions?.[index]?.messagingChannelId?.message;
      if (actionError) actionErrors.push(actionError);
    });
    return actionErrors;
  }, [formState, watch]);

  const conditionalOperator = watch("conditionalOperator");
  const terminology = getEmailTerminology(provider);
  const existingActionTypes = useMemo(
    () => ruleEditorActions.map((action) => action.type),
    [ruleEditorActions],
  );

  const formErrors = useMemo(
    () =>
      Object.values(formState.errors)
        .filter((error): error is { message: string } => Boolean(error.message))
        .map((error) => error.message),
    [formState],
  );

  const typeOptions = useMemo(() => {
    const connectedMessagingChannels = getConnectedRuleNotificationChannels(
      messagingChannelsData?.channels,
    );
    return getRuleActionTypeOptions({
      provider,
      labelActionText: terminology.label.action,
      hasConnectedMessagingChannels: connectedMessagingChannels.length > 0,
      hasAvailableMessagingProviders:
        (messagingChannelsData?.availableProviders.length ?? 0) > 0,
      systemType: rule.systemType,
      existingActionTypes,
    }).map((option) => ({
      ...option,
      icon: getActionIcon(option.value),
    }));
  }, [
    existingActionTypes,
    messagingChannelsData?.channels,
    messagingChannelsData?.availableProviders,
    provider,
    terminology.label.action,
    rule.systemType,
  ]);

  const [isNameEditMode, setIsNameEditMode] = useState(alwaysEditMode);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const toggleNameEditMode = useCallback(() => {
    if (!alwaysEditMode) {
      setIsNameEditMode((prev: boolean) => !prev);
    }
  }, [alwaysEditMode]);

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {isSubmitted && formErrors.length > 0 && (
          <div className="mt-4">
            <AlertError
              title="Error"
              description={
                <ul className="list-disc">
                  {formErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              }
            />
          </div>
        )}

        <div>
          {isNameEditMode ? (
            <Input
              type="text"
              name="name"
              label="Rule name"
              registerProps={register("name")}
              error={errors.name}
              placeholder="e.g. Label receipts"
            />
          ) : (
            <TypographyH3
              onClick={toggleNameEditMode}
              className="group flex cursor-pointer items-center"
            >
              {watch("name")}
              <PencilIcon className="ml-2 size-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </TypographyH3>
          )}
        </div>

        <RuleSectionCard
          icon={MailIcon}
          color="blue"
          title="When I get an email"
          errors={
            errors.conditions?.root?.message ? (
              <AlertError
                title="Error"
                description={errors.conditions.root.message}
              />
            ) : undefined
          }
        >
          <ConditionSteps
            conditionFields={conditionFields}
            conditionalOperator={conditionalOperator}
            removeCondition={removeCondition}
            watch={watch}
            setValue={setValue}
            register={register}
            errors={errors}
            conditions={conditions}
            ruleSystemType={rule.systemType}
            appendCondition={appendCondition}
          />
        </RuleSectionCard>

        <RuleSectionCard
          icon={BotIcon}
          color="green"
          title="Then:"
          errors={
            actionErrors.length > 0 ? (
              <AlertError
                title="Error"
                description={
                  <ul className="list-inside list-disc">
                    {actionErrors.map((error, index) => (
                      <li key={`action-${index}`}>{error}</li>
                    ))}
                  </ul>
                }
              />
            ) : undefined
          }
        >
          <ActionSteps
            actionFields={actionFields}
            register={register}
            watch={watch}
            setValue={setValue}
            append={append}
            remove={remove}
            replaceActions={replace}
            control={control}
            errors={errors}
            userLabels={userLabels}
            isLoading={isLoading}
            mutate={mutateLabels}
            emailAccountId={emailAccountId}
            typeOptions={typeOptions}
            folders={folders}
            foldersLoading={foldersLoading}
            messagingChannels={messagingChannelsData?.channels ?? []}
            availableMessagingProviders={
              messagingChannelsData?.availableProviders ?? []
            }
            attachmentSources={attachmentSources}
            onAttachmentSourcesChange={setAttachmentSources}
          />
        </RuleSectionCard>

        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 py-2 text-sm font-medium text-left text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDownIcon
                className={cn(
                  "size-4 transition-transform",
                  isAdvancedOpen && "rotate-180",
                )}
              />
              Advanced options
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {isAdvancedOpen ? (
              <div className="rounded-md border divide-y">
                <AdvancedRow
                  title="Apply to threads"
                  description="Run on every reply in a conversation, not just the first message."
                >
                  <Tooltip
                    content="This can't be changed for this rule type."
                    hide={allowMultipleConditions(rule.systemType)}
                  >
                    <span>
                      <Toggle
                        name="runOnThreads"
                        enabled={watch("runOnThreads") || false}
                        onChange={(enabled) => {
                          setValue("runOnThreads", enabled);
                        }}
                        disabled={!allowMultipleConditions(rule.systemType)}
                      />
                    </span>
                  </Tooltip>
                </AdvancedRow>

                {env.NEXT_PUBLIC_DIGEST_ENABLED && (
                  <AdvancedRow
                    title="Include in digest"
                    description="Show matched emails in your digest summary."
                  >
                    <Toggle
                      name="digest"
                      enabled={watch("digest") || false}
                      onChange={(enabled) => {
                        setValue("digest", enabled);
                      }}
                    />
                  </AdvancedRow>
                )}

                {!!rule.id && (
                  <AdvancedRow
                    title="Learned patterns"
                    description="Patterns inferred from your corrections."
                  >
                    <Tooltip
                      content="Learned patterns aren't available for this rule type."
                      hide={!isConversationStatusType(rule.systemType)}
                    >
                      <span>
                        <LearnedPatternsDialog
                          ruleId={rule.id}
                          groupId={rule.groupId || null}
                          disabled={isConversationStatusType(rule.systemType)}
                          label="View"
                        />
                      </span>
                    </Tooltip>
                  </AdvancedRow>
                )}

                {rule.id && !rule.systemType && (
                  <AdvancedRow
                    title="Delete rule"
                    description="Permanently remove this rule."
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      Icon={TrashIcon}
                      loading={isDeleting}
                      disabled={isSubmitting}
                      onClick={async () => {
                        const yes = confirm(
                          "Are you sure you want to delete this rule?",
                        );
                        if (yes) {
                          try {
                            setIsDeleting(true);
                            const result = await deleteRuleAction(
                              emailAccountId,
                              {
                                id: rule.id!,
                              },
                            );
                            if (result?.serverError) {
                              toastError({
                                description: result.serverError,
                              });
                            } else {
                              toastSuccess({
                                description: "The rule has been deleted.",
                              });

                              if (isDialog && onSuccess) {
                                onSuccess();
                              }

                              router.push(
                                prefixPath(
                                  emailAccountId,
                                  "/automation?tab=rules",
                                ),
                              );
                            }
                          } catch {
                            toastError({
                              description: "Failed to delete rule.",
                            });
                          } finally {
                            setIsDeleting(false);
                          }
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </AdvancedRow>
                )}
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex justify-end space-x-2">
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}

          {rule.id ? (
            <Button
              type="submit"
              size="sm"
              loading={isSubmitting}
              disabled={isDeleting}
            >
              Save
            </Button>
          ) : (
            <Button type="submit" size="sm" loading={isSubmitting}>
              Create
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

function AdvancedRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function allowMultipleConditions(systemType: SystemType | null | undefined) {
  return (
    systemType !== SystemType.COLD_EMAIL &&
    !isConversationStatusType(systemType)
  );
}

function restorePersistedActionSequence({
  actions,
  originalActions,
}: {
  actions: CreateRuleBody["actions"];
  originalActions: CreateRuleBody["actions"];
}) {
  const originalIndexById = new Map(
    originalActions.flatMap((action, index) =>
      action.id ? [[action.id, index] as const] : [],
    ),
  );

  if (originalIndexById.size === 0) return actions;

  const existing: CreateRuleBody["actions"] = [];
  const added: CreateRuleBody["actions"] = [];

  for (const action of actions) {
    if (action.id && originalIndexById.has(action.id)) {
      existing.push(action);
    } else {
      added.push(action);
    }
  }

  if (existing.length === 0) return actions;

  existing.sort(
    (a, b) =>
      (originalIndexById.get(a.id ?? "") ?? 0) -
      (originalIndexById.get(b.id ?? "") ?? 0),
  );

  return [...existing, ...added];
}

function getRuleEditorActions(actions: CreateRuleBody["actions"]) {
  if (env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED === false) {
    return actions.filter((action) => action.type !== ActionType.CALL_WEBHOOK);
  }

  return actions;
}

type ActionTypeOption = {
  label: string;
  value: ActionType;
};

export function getRuleActionTypeOptions({
  provider,
  labelActionText,
  hasConnectedMessagingChannels,
  hasAvailableMessagingProviders,
  systemType,
  existingActionTypes,
}: {
  provider: string;
  labelActionText: string;
  hasConnectedMessagingChannels: boolean;
  hasAvailableMessagingProviders: boolean;
  systemType: SystemType | null | undefined;
  existingActionTypes: ActionType[];
}): ActionTypeOption[] {
  const messagingIsAvailable =
    hasConnectedMessagingChannels || hasAvailableMessagingProviders;
  const availableActions = new Set(
    getAvailableActionsForRuleEditor({
      provider,
      existingActionTypes,
    }),
  );
  const extraActions = new Set(getExtraAvailableActionsForRuleEditor());

  return [
    {
      label: labelActionText,
      value: ActionType.LABEL,
    },
    ...(availableActions.has(ActionType.MOVE_FOLDER)
      ? [
          {
            label: "Move to folder",
            value: ActionType.MOVE_FOLDER,
          },
        ]
      : []),
    ...(availableActions.has(ActionType.DRAFT_EMAIL)
      ? [
          {
            label: "Draft reply",
            value: ActionType.DRAFT_EMAIL,
          },
        ]
      : []),
    {
      label: "Archive",
      value: ActionType.ARCHIVE,
    },
    {
      label: "Mark read",
      value: ActionType.MARK_READ,
    },
    ...(availableActions.has(ActionType.REPLY)
      ? [
          {
            label: "Reply",
            value: ActionType.REPLY,
          },
        ]
      : []),
    ...(availableActions.has(ActionType.SEND_EMAIL)
      ? [
          {
            label: "Send email",
            value: ActionType.SEND_EMAIL,
          },
        ]
      : []),
    ...(availableActions.has(ActionType.FORWARD)
      ? [
          {
            label: "Forward",
            value: ActionType.FORWARD,
          },
        ]
      : []),
    {
      label: "Mark spam",
      value: ActionType.MARK_SPAM,
    },
    ...(extraActions.has(ActionType.CALL_WEBHOOK)
      ? [
          {
            label: "Call webhook",
            value: ActionType.CALL_WEBHOOK,
          },
        ]
      : []),
    ...(messagingIsAvailable ||
    existingActionTypes.includes(ActionType.NOTIFY_MESSAGING_CHANNEL)
      ? [
          {
            label: "Notify via chat app",
            value: ActionType.NOTIFY_MESSAGING_CHANNEL,
          },
        ]
      : []),
    ...((systemType === SystemType.COLD_EMAIL &&
      env.NEXT_PUBLIC_IS_RESEND_CONFIGURED) ||
    existingActionTypes.includes(ActionType.NOTIFY_SENDER)
      ? [
          {
            label: "Notify sender",
            value: ActionType.NOTIFY_SENDER,
          },
        ]
      : []),
  ];
}
