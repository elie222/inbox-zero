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
  InboxIcon,
  ZapIcon,
  ChevronRightIcon,
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
import {
  ActionSteps,
  formatMessagingDestinationLabel,
} from "@/app/(app)/[emailAccountId]/assistant/ActionSteps";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import { RuleLoader } from "@/app/(app)/[emailAccountId]/assistant/RuleLoader";
import {
  getAvailableActionsForRuleEditor,
  getExtraAvailableActionsForRuleEditor,
} from "@/utils/ai/rule/action-availability";
import { handleRuleAttachmentSourceSave } from "@/utils/attachments/rule";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
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
          notifyMessagingChannelId:
            ruleEditorActions.find(
              (action) => action.type === ActionType.NOTIFY_MESSAGING_CHANNEL,
            )?.messagingChannelId ?? null,
          actions: [
            ...normalizeDraftReplyActions(
              sortActionsByPriority(
                ruleEditorActions
                  .filter(
                    (action) =>
                      action.type !== ActionType.DIGEST &&
                      action.type !== ActionType.NOTIFY_MESSAGING_CHANNEL,
                  )
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

      // Add NOTIFY_MESSAGING_CHANNEL action if a channel is selected
      if (data.notifyMessagingChannelId) {
        const existingNotifyAction = rule.actions.find(
          (action) => action.type === ActionType.NOTIFY_MESSAGING_CHANNEL,
        );

        actionsToSubmit.push({
          id: existingNotifyAction?.id,
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          messagingChannelId: data.notifyMessagingChannelId,
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

  const typeOptions = useMemo(
    () =>
      getRuleActionTypeOptions({
        provider,
        labelActionText: terminology.label.action,
        systemType: rule.systemType,
        existingActionTypes,
      }).map((option) => ({
        ...option,
        icon: getActionIcon(option.value),
      })),
    [existingActionTypes, provider, terminology.label.action, rule.systemType],
  );

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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
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
          icon={InboxIcon}
          color="blue"
          title="When I get an email"
          className="!mt-6"
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
          icon={ZapIcon}
          color="green"
          title="Then"
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
              <ChevronRightIcon
                className={cn(
                  "size-4 transition-transform",
                  isAdvancedOpen && "rotate-90",
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

                <NotifyChannelRow
                  channels={messagingChannelsData?.channels ?? []}
                  availableProviders={
                    messagingChannelsData?.availableProviders ?? []
                  }
                  emailAccountId={emailAccountId}
                  value={watch("notifyMessagingChannelId") ?? null}
                  onChange={(channelId) => {
                    setValue("notifyMessagingChannelId", channelId);
                  }}
                  hasDraftToChat={watch("actions")?.some(
                    (action) =>
                      action.type === ActionType.DRAFT_MESSAGING_CHANNEL,
                  )}
                />

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

        <div className="flex justify-end space-x-2 !mt-6">
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

const CONNECT_SENTINEL = "__connect__";

function NotifyChannelRow({
  channels,
  availableProviders,
  emailAccountId,
  value,
  onChange,
  hasDraftToChat,
}: {
  channels: GetMessagingChannelsResponse["channels"];
  availableProviders: GetMessagingChannelsResponse["availableProviders"];
  emailAccountId: string;
  value: string | null;
  onChange: (channelId: string | null) => void;
  hasDraftToChat?: boolean;
}) {
  const router = useRouter();
  const connectedChannels = getConnectedRuleNotificationChannels(channels);
  const hasChannels = connectedChannels.length > 0;
  const canConnect = availableProviders.length > 0;

  if (!hasChannels && !canConnect) return null;
  const selectedChannelIsConnected =
    !value || connectedChannels.some((channel) => channel.id === value);
  const selectValue = selectedChannelIsConnected ? (value ?? "off") : "off";

  const channelsPath = prefixPath(emailAccountId, "/channels");
  const draftsNote = hasDraftToChat
    ? "Drafts also go to chat — configured in actions above."
    : undefined;

  if (!hasChannels) {
    return (
      <AdvancedRow
        title="Notify in chat"
        description="Send a message when this rule matches."
        note={draftsNote}
      >
        <Button asChild variant="outline" size="sm">
          <Link href={channelsPath}>Connect</Link>
        </Button>
      </AdvancedRow>
    );
  }

  const channelsByProvider = new Map<
    GetMessagingChannelsResponse["channels"][number]["provider"],
    GetMessagingChannelsResponse["channels"]
  >();
  for (const channel of connectedChannels) {
    const list = channelsByProvider.get(channel.provider) ?? [];
    list.push(channel);
    channelsByProvider.set(channel.provider, list);
  }
  const showGroups = channelsByProvider.size > 1;

  return (
    <AdvancedRow
      title="Notify in chat"
      description="Send a message when this rule matches."
      note={draftsNote}
    >
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === CONNECT_SENTINEL) {
            router.push(channelsPath);
            return;
          }
          onChange(next === "off" ? null : next);
        }}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="off">Off</SelectItem>
          {showGroups
            ? Array.from(channelsByProvider.entries()).map(
                ([provider, providerChannels]) => (
                  <SelectGroup key={provider}>
                    <SelectLabel>
                      {getMessagingProviderName(provider)}
                    </SelectLabel>
                    {providerChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {formatMessagingDestinationLabel(channel)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ),
              )
            : connectedChannels.map((channel) => (
                <SelectItem key={channel.id} value={channel.id}>
                  {formatMessagingDestinationLabel(channel)}
                </SelectItem>
              ))}
          {canConnect ? (
            <>
              <SelectSeparator />
              <SelectItem value={CONNECT_SENTINEL}>
                + Connect new channel
              </SelectItem>
            </>
          ) : null}
        </SelectContent>
      </Select>
    </AdvancedRow>
  );
}

function AdvancedRow({
  title,
  description,
  children,
  note,
}: {
  title: string;
  description: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
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
  systemType,
  existingActionTypes,
}: {
  provider: string;
  labelActionText: string;
  systemType: SystemType | null | undefined;
  existingActionTypes: ActionType[];
}): ActionTypeOption[] {
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
