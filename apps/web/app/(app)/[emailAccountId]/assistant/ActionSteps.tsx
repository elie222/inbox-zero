import Link from "next/link";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ChevronDownIcon, ChevronRightIcon, PaperclipIcon } from "lucide-react";
import type {
  useForm,
  Control,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { useWatch } from "react-hook-form";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { ActionType } from "@/generated/prisma/enums";
import { RuleSteps } from "@/app/(app)/[emailAccountId]/assistant/RuleSteps";
import type { EmailLabel } from "@/providers/email-label-types";
import type { OutlookFolder } from "@/utils/outlook/folders";
import { Button } from "@/components/ui/button";
import { ErrorMessage, Input } from "@/components/Input";
import { actionInputs } from "@/utils/action-item";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { hasVariables, TEMPLATE_VARIABLE_PATTERN } from "@/utils/template";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { canActionBeDelayed } from "@/utils/delayed-actions";
import { FolderSelector } from "@/components/FolderSelector";
import { cn } from "@/utils";
import { WebhookDocumentationLink } from "@/components/WebhookDocumentation";
import { LabelCombobox } from "@/components/LabelCombobox";
import { RuleStep } from "@/app/(app)/[emailAccountId]/assistant/RuleStep";
import { Card } from "@/components/ui/card";
import { MutedText } from "@/components/Typography";
import { BRAND_NAME } from "@/utils/branding";
import { ActionAttachmentsField } from "@/app/(app)/[emailAccountId]/assistant/ActionAttachmentsField";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import {
  getConnectAppLabel,
  getMessagingProviderName,
} from "@/utils/messaging/platforms";
import { getConnectedRuleNotificationChannels } from "@/utils/messaging/routes";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import { prefixPath } from "@/utils/path";
import { isDraftReplyActionType } from "@/utils/actions/draft-reply";
import {
  buildDraftEmailAction,
  buildDraftMessagingAction,
  buildVisibleDraftReplyGroups,
  getDraftReplyMessagingChannelIds,
  type DraftReplyDelivery,
} from "@/app/(app)/[emailAccountId]/assistant/draftReplyActions";

type MessagingChannelOption = GetMessagingChannelsResponse["channels"][number];
type MessagingProviderOption =
  GetMessagingChannelsResponse["availableProviders"][number];

export function ActionSteps({
  actionFields,
  register,
  watch,
  setValue,
  control,
  errors,
  userLabels,
  isLoading,
  mutate,
  emailAccountId,
  remove,
  replaceActions,
  typeOptions,
  folders,
  foldersLoading,
  messagingChannels,
  availableMessagingProviders,
  append,
  attachmentSources,
  onAttachmentSourcesChange,
}: {
  actionFields: Array<{ id: string } & CreateRuleBody["actions"][number]>;
  register: UseFormRegister<CreateRuleBody>;
  watch: UseFormWatch<CreateRuleBody>;
  setValue: UseFormSetValue<CreateRuleBody>;
  control: Control<CreateRuleBody>;
  errors: FieldErrors<CreateRuleBody>;
  userLabels: EmailLabel[];
  isLoading: boolean;
  mutate: () => Promise<unknown>;
  emailAccountId: string;
  remove: (index?: number | number[]) => void;
  replaceActions: (actions: CreateRuleBody["actions"]) => void;
  typeOptions: { label: string; value: ActionType; icon: React.ElementType }[];
  folders: OutlookFolder[];
  foldersLoading: boolean;
  messagingChannels: MessagingChannelOption[];
  availableMessagingProviders: MessagingProviderOption[];
  append: (action: CreateRuleBody["actions"][number]) => void;
  attachmentSources: AttachmentSourceInput[];
  onAttachmentSourcesChange: (value: AttachmentSourceInput[]) => void;
}) {
  const actions = useWatch({ control, name: "actions" }) ?? [];
  const visibleActionGroups = useMemo(
    () => buildVisibleDraftReplyGroups(actions),
    [actions],
  );

  return (
    <RuleSteps
      onAdd={() => append({ type: ActionType.LABEL })}
      addButtonLabel="Add Action"
      addButtonDisabled={false}
    >
      {visibleActionGroups.map(({ primaryIndex, draftMessagingIndexes }) => (
        <ActionCard
          key={actionFields[primaryIndex]?.id ?? `action-${primaryIndex}`}
          index={primaryIndex}
          draftMessagingIndexes={draftMessagingIndexes}
          register={register}
          watch={watch}
          setValue={setValue}
          control={control}
          errors={errors}
          userLabels={userLabels}
          isLoading={isLoading}
          mutate={mutate}
          emailAccountId={emailAccountId}
          remove={remove}
          replaceActions={replaceActions}
          typeOptions={typeOptions}
          folders={folders}
          foldersLoading={foldersLoading}
          messagingChannels={messagingChannels}
          availableMessagingProviders={availableMessagingProviders}
          attachmentSources={attachmentSources}
          onAttachmentSourcesChange={onAttachmentSourcesChange}
        />
      ))}
    </RuleSteps>
  );
}

function ActionCard({
  index,
  draftMessagingIndexes,
  register,
  watch,
  setValue,
  control,
  errors,
  userLabels,
  isLoading,
  mutate,
  emailAccountId,
  remove,
  replaceActions,
  typeOptions,
  folders,
  foldersLoading,
  messagingChannels,
  availableMessagingProviders,
  attachmentSources,
  onAttachmentSourcesChange,
}: {
  index: number;
  draftMessagingIndexes: number[];
  register: ReturnType<typeof useForm<CreateRuleBody>>["register"];
  watch: ReturnType<typeof useForm<CreateRuleBody>>["watch"];
  setValue: ReturnType<typeof useForm<CreateRuleBody>>["setValue"];
  control: ReturnType<typeof useForm<CreateRuleBody>>["control"];
  errors: FieldErrors<CreateRuleBody>;
  userLabels: EmailLabel[];
  isLoading: boolean;
  mutate: () => Promise<unknown>;
  emailAccountId: string;
  remove: (index?: number | number[]) => void;
  replaceActions: (actions: CreateRuleBody["actions"]) => void;
  typeOptions: { label: string; value: ActionType; icon: React.ElementType }[];
  folders: OutlookFolder[];
  foldersLoading: boolean;
  messagingChannels: MessagingChannelOption[];
  availableMessagingProviders: MessagingProviderOption[];
  attachmentSources: AttachmentSourceInput[];
  onAttachmentSourcesChange: (value: AttachmentSourceInput[]) => void;
}) {
  const actions = useWatch({ control, name: "actions" }) ?? [];
  const primaryAction = watch(`actions.${index}`);
  const draftMessagingActions = draftMessagingIndexes
    .map((draftMessagingIndex) => watch(`actions.${draftMessagingIndex}`))
    .filter(
      (action): action is NonNullable<CreateRuleBody["actions"][number]> =>
        Boolean(action),
    );
  const rawActionType = primaryAction?.type ?? ActionType.LABEL;
  const actionType = isDraftReplyActionType(rawActionType)
    ? ActionType.DRAFT_EMAIL
    : rawActionType;
  const fields = actionInputs[actionType].fields;
  const selectedTypeOption = typeOptions.find(
    (option) => option.value === actionType,
  );
  const SelectedTypeIcon = selectedTypeOption?.icon;
  const [expandedFields, setExpandedFields] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [attachmentsDialogOpen, setAttachmentsDialogOpen] = useState(false);

  // Get expandable fields that should be visible regardless of expanded state
  const hasExpandableFields = fields.some((field) => field.expandable);

  // Precompute content setManually state
  const contentSetManually = isDraftReplyActionType(rawActionType)
    ? !!watch(`actions.${index}.content.setManually`)
    : false;

  const actionCanBeDelayed = useMemo(
    () => canActionBeDelayed(actionType),
    [actionType],
  );

  const delayValue = watch(`actions.${index}.delayInMinutes`);
  const delayEnabled = !!delayValue;
  const connectedMessagingChannels =
    getConnectedRuleNotificationChannels(messagingChannels);
  const selectedMessagingChannelIds = getDraftReplyMessagingChannelIds({
    primaryAction,
    draftMessagingActions,
  });
  const selectedMessagingChannels = selectedMessagingChannelIds
    .map((channelId) =>
      connectedMessagingChannels.find(
        (messagingChannel) => messagingChannel.id === channelId,
      ),
    )
    .filter(
      (channel): channel is MessagingChannelOption => channel !== undefined,
    );
  const selectedMessagingChannel = selectedMessagingChannels[0];
  const draftReplyGroupIndexes = [index, ...draftMessagingIndexes];
  const draftReplyDelivery: DraftReplyDelivery =
    selectedMessagingChannels.length === 0
      ? "EMAIL"
      : primaryAction?.type === ActionType.DRAFT_MESSAGING_CHANNEL
        ? "MESSAGING"
        : "EMAIL_AND_MESSAGING";
  const deliveryErrorMessage = getMessagingChannelError({
    errors,
    actionIndexes: draftReplyGroupIndexes,
  });

  // Helper function to determine if a field can use variables based on context
  const canFieldUseVariables = (
    field: { name: string; expandable?: boolean },
    isFieldAiGenerated: boolean,
  ) => {
    // Check if the field is visible - this is handled before calling the function

    // For labelId field, only allow variables if AI generated is toggled on
    if (field.name === "labelId") {
      return isFieldAiGenerated;
    }

    if (field.name === "content" && isDraftReplyActionType(rawActionType)) {
      return contentSetManually;
    }

    if (field.name === "folderName" || field.name === "folderId") {
      return false;
    }

    // For other fields, allow variables
    return true;
  };

  // Check if we should show the variable pro tip
  const shouldShowProTip = fields.some((field) => {
    if (field.name === "folderName" || field.name === "folderId") {
      return false;
    }

    // Don't show for labelId fields
    if (field.name === "labelId") {
      return false;
    }

    // Get field value for zodField objects
    const value = watch(`actions.${index}.${field.name}.value`);
    const isFieldVisible = !field.expandable || expandedFields || !!value;

    if (!isFieldVisible) return false;

    if (field.name === "content" && isDraftReplyActionType(rawActionType)) {
      return contentSetManually;
    }

    // For other fields, show if they're visible
    return true;
  });

  const leftContent = (
    <FormItem>
      <Select
        value={actionType}
        onValueChange={(nextValue) =>
          updateActionType({
            nextType: nextValue as ActionType,
            index,
            draftMessagingIndexes,
            primaryAction,
            setValue,
            remove,
          })
        }
      >
        <FormControl>
          <SelectTrigger className="w-[180px]">
            {selectedTypeOption ? (
              <div className="flex items-center gap-2">
                {SelectedTypeIcon && <SelectedTypeIcon className="size-4" />}
                <span>{selectedTypeOption.label}</span>
              </div>
            ) : (
              <SelectValue placeholder="Select action" />
            )}
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {typeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  {Icon && <Icon className="size-4" />}
                  {option.label}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </FormItem>
  );

  const isEmailAction =
    isDraftReplyActionType(rawActionType) ||
    actionType === ActionType.REPLY ||
    actionType === ActionType.SEND_EMAIL ||
    actionType === ActionType.FORWARD;

  // Separate fields into non-expandable and expandable
  const nonExpandableFields = fields.filter((field) => !field.expandable);
  const expandableFields = fields.filter((field) => field.expandable);

  const renderField = (field: (typeof fields)[number]) => {
    const fieldValue = watch(`actions.${index}.${field.name}`);
    const isAiGenerated = !!fieldValue?.ai;
    // For AI-generated labelId, read from .name instead of .value
    const value =
      field.name === "labelId" && isAiGenerated
        ? watch(`actions.${index}.${field.name}.name`) || ""
        : watch(`actions.${index}.${field.name}.value`) || "";
    const setManually = !!watch(`actions.${index}.${field.name}.setManually`);

    // Show field if it's not expandable, or it's expanded, or it has a value
    const isDraftReplyAction = isDraftReplyActionType(rawActionType);
    const showField =
      !field.expandable || isDraftReplyAction || expandedFields || !!value;

    if (!showField) return null;

    return (
      <div
        key={field.name}
        className={cn(
          "space-y-4 mx-auto w-full",
          field.expandable &&
            !value &&
            !isDraftReplyActionType(rawActionType) &&
            "opacity-80",
        )}
      >
        <div>
          {field.name === "labelId" && actionType === ActionType.LABEL ? (
            <div>
              <div className="flex items-center gap-2">
                {isAiGenerated ? (
                  <div className="relative flex-1 min-w-[200px]">
                    <Input
                      type="text"
                      name={`actions.${index}.${field.name}.name`}
                      registerProps={register(
                        `actions.${index}.${field.name}.name`,
                      )}
                      className="pr-8"
                      placeholder='e.g. {{choose "urgent", "normal", or "low"}}'
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <TooltipExplanation
                        side="right"
                        text="When enabled our AI will generate a value when processing the email. Put the prompt inside braces like so: {{your prompt here}}."
                        className="text-gray-400"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-w-[200px]">
                    <LabelCombobox
                      userLabels={userLabels || []}
                      isLoading={isLoading}
                      mutate={mutate}
                      value={{
                        id: value,
                        name: fieldValue?.name || null,
                      }}
                      onChangeValue={(newValue: string) => {
                        setValue(
                          `actions.${index}.${field.name}.value`,
                          newValue,
                        );
                      }}
                      emailAccountId={emailAccountId}
                    />
                  </div>
                )}
                {actionCanBeDelayed &&
                  actionType === ActionType.LABEL &&
                  delayEnabled && (
                    <>
                      <span className="text-muted-foreground">after</span>
                      <DelayInputControls
                        index={index}
                        delayInMinutes={delayValue}
                        setValue={setValue}
                      />
                    </>
                  )}
              </div>
            </div>
          ) : field.name === "folderName" &&
            actionType === ActionType.MOVE_FOLDER ? (
            <div>
              <FolderSelector
                folders={folders}
                isLoading={foldersLoading}
                value={{
                  name: watch(`actions.${index}.folderName.value`) || "",
                  id: watch(`actions.${index}.folderId.value`) || "",
                }}
                onChangeValue={(folderData) => {
                  if (folderData.name && folderData.id) {
                    setValue(`actions.${index}.folderName`, {
                      value: folderData.name,
                    });
                    setValue(`actions.${index}.folderId`, {
                      value: folderData.id,
                    });
                  } else {
                    setValue(`actions.${index}.folderName`, undefined);
                    setValue(`actions.${index}.folderId`, undefined);
                  }
                }}
              />
            </div>
          ) : field.name === "content" &&
            isDraftReplyActionType(rawActionType) &&
            !setManually ? null : field.textArea ? (
            <div>
              {isEmailAction && (
                <Label
                  htmlFor={`actions.${index}.${field.name}.value`}
                  className="mb-2 block"
                >
                  {field.label}
                </Label>
              )}
              <TextareaAutosize
                className="block w-full flex-1 whitespace-pre-wrap rounded-md border border-border bg-background shadow-sm focus:border-black focus:ring-black sm:text-sm"
                minRows={3}
                rows={3}
                {...register(`actions.${index}.${field.name}.value`)}
              />
            </div>
          ) : (
            <div>
              {(isEmailAction || actionType === ActionType.CALL_WEBHOOK) && (
                <Label
                  htmlFor={`actions.${index}.${field.name}.value`}
                  className="mb-2 block"
                >
                  {field.label}
                </Label>
              )}
              <Input
                type="text"
                name={`actions.${index}.${field.name}.value`}
                registerProps={register(`actions.${index}.${field.name}.value`)}
                placeholder={field.placeholder}
              />
              {field.name === "url" &&
                actionType === ActionType.CALL_WEBHOOK && (
                  <div className="mt-2">
                    <WebhookDocumentationLink />
                  </div>
                )}
            </div>
          )}

          {field.name === "labelId" &&
            actionType === ActionType.LABEL &&
            errors?.actions?.[index]?.delayInMinutes && (
              <div className="mt-2">
                <ErrorMessage
                  message={
                    errors.actions?.[index]?.delayInMinutes?.message ||
                    "Invalid delay value"
                  }
                />
              </div>
            )}
        </div>
        {hasVariables(value) &&
          canFieldUseVariables(field, isAiGenerated) &&
          field.name !== "labelId" && (
            <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-sm text-foreground">
              {(value || "")
                .split(new RegExp(`(${TEMPLATE_VARIABLE_PATTERN})`, "g"))
                .map((part: string, idx: number) =>
                  part.startsWith("{{") ? (
                    <span
                      key={idx}
                      className="rounded bg-blue-100 px-1 text-blue-500 dark:bg-blue-950 dark:text-blue-400"
                    >
                      <sub className="font-sans">AI</sub>
                      {part}
                    </span>
                  ) : (
                    <span key={idx}>{part}</span>
                  ),
                )}
            </div>
          )}

        {errors?.actions?.[index]?.[field.name]?.message && (
          <ErrorMessage
            message={
              errors.actions?.[index]?.[field.name]?.message?.toString() ||
              "Invalid value"
            }
          />
        )}
      </div>
    );
  };

  const fieldsContent = (
    <>
      {renderFieldRows(nonExpandableFields, renderField)}
      {isDraftReplyActionType(rawActionType)
        ? // Draft reply actions always show all configurable fields.
          renderFieldRows(expandableFields, renderField)
        : hasExpandableFields &&
          expandableFields.length > 0 && (
            <>
              <div className="mt-2 flex">
                <Button
                  size="xs"
                  variant="ghost"
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                  onClick={() => setExpandedFields(!expandedFields)}
                >
                  {expandedFields ? (
                    <>
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                      Hide extra fields
                    </>
                  ) : (
                    <>
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                      Show all fields
                    </>
                  )}
                </Button>
              </div>
              {renderFieldRows(expandableFields, renderField)}
            </>
          )}
    </>
  );

  const delayControls =
    actionCanBeDelayed && actionType !== ActionType.LABEL && delayEnabled ? (
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <span className="text-muted-foreground">after</span>
          <DelayInputControls
            index={index}
            delayInMinutes={delayValue}
            setValue={setValue}
          />
        </div>

        {errors?.actions?.[index]?.delayInMinutes && (
          <div className="mt-2">
            <ErrorMessage
              message={
                errors.actions?.[index]?.delayInMinutes?.message ||
                "Invalid delay value"
              }
            />
          </div>
        )}
      </div>
    ) : null;

  const isDraftEmailWithoutManualContent =
    isDraftReplyActionType(rawActionType) && !contentSetManually;

  const isNotifySender = actionType === ActionType.NOTIFY_SENDER;
  const isMessagingNotification =
    actionType === ActionType.NOTIFY_MESSAGING_CHANNEL;

  const supportsAttachments =
    isDraftReplyActionType(rawActionType) ||
    actionType === ActionType.REPLY ||
    actionType === ActionType.SEND_EMAIL;
  const supportsAiSelectedSources = isDraftReplyActionType(rawActionType);
  const canConfigureStaticAttachments = isDraftReplyActionType(rawActionType)
    ? contentSetManually
    : supportsAttachments;

  const staticAttachments = useWatch({
    control,
    name: `actions.${index}.staticAttachments`,
  }) as AttachmentSourceInput[] | undefined;

  const attachmentsField = supportsAttachments ? (
    <ActionAttachmentsField
      value={canConfigureStaticAttachments ? (staticAttachments ?? []) : []}
      onChange={(newValue) =>
        setValue(`actions.${index}.staticAttachments`, newValue)
      }
      emailAccountId={emailAccountId}
      contentSetManually={canConfigureStaticAttachments}
      allowAiSelectedSources={supportsAiSelectedSources}
      attachmentSources={attachmentSources}
      onAttachmentSourcesChange={onAttachmentSourcesChange}
    />
  ) : null;

  const canConnectMessagingApp = availableMessagingProviders.length > 0;

  const deliveryField = isMessagingNotification ? (
    <MessagingChannelField
      control={control}
      index={index}
      label="Send to"
      messagingChannels={connectedMessagingChannels}
    />
  ) : null;

  const deliverySummary = isDraftReplyActionType(rawActionType) ? (
    <MutedText className="px-1">
      Deliver to{" "}
      <span className="font-medium text-foreground">
        {formatDraftReplyDeliverySummary({
          delivery: draftReplyDelivery,
          selectedChannels: selectedMessagingChannels,
        })}
      </span>
    </MutedText>
  ) : isMessagingNotification ? (
    <MutedText className="px-1">
      {selectedMessagingChannel ? (
        <>
          Send to{" "}
          <span className="font-medium text-foreground">
            {formatMessagingDestinationLabel(selectedMessagingChannel)}
          </span>
        </>
      ) : (
        "Choose a delivery destination from More options."
      )}
    </MutedText>
  ) : null;

  const attachmentsSummary =
    supportsAttachments && staticAttachments?.length ? (
      <MutedText className="px-1">
        Attachments:{" "}
        <span className="font-medium text-foreground">
          {staticAttachments.length}
        </span>
      </MutedText>
    ) : null;

  const handleDraftReplyDeliveryChange = useCallback(
    ({
      includeEmail,
      selectedMessagingChannelIds,
    }: {
      includeEmail: boolean;
      selectedMessagingChannelIds: string[];
    }) => {
      updateDraftReplyDelivery({
        includeEmail,
        selectedMessagingChannelIds,
        actions,
        index,
        draftMessagingIndexes,
        primaryAction,
        draftMessagingActions,
        replaceActions,
      });
    },
    [
      actions,
      draftMessagingActions,
      draftMessagingIndexes,
      index,
      primaryAction,
      replaceActions,
    ],
  );

  const draftReplyDeliverySection = isDraftReplyActionType(rawActionType) ? (
    <div className="space-y-4 border-t border-border pt-4">
      <DraftReplyReviewChannelsSection
        emailAccountId={emailAccountId}
        delivery={draftReplyDelivery}
        selectedChannels={selectedMessagingChannels}
        connectedChannels={connectedMessagingChannels}
        connectAppLabel={getConnectAppLabel(availableMessagingProviders)}
        errorMessage={deliveryErrorMessage}
        onChange={handleDraftReplyDeliveryChange}
      />
      {delayControls || attachmentsSummary ? (
        <div className="space-y-3 border-t border-border pt-4">
          {delayControls}
          {attachmentsSummary}
        </div>
      ) : null}
    </div>
  ) : null;

  const rightContent = (
    <>
      {isNotifySender ? (
        <MutedText className="px-1 h-full flex items-center">
          {`Sends an automated notification from ${BRAND_NAME} informing the sender their email was filtered as cold outreach.`}
        </MutedText>
      ) : isDraftReplyActionType(rawActionType) ? (
        <Card className="p-4 space-y-4">
          {isDraftEmailWithoutManualContent ? (
            <MutedText className="px-1">
              Our AI generates a draft reply from your email history and
              knowledge base.
            </MutedText>
          ) : (
            <>
              {fieldsContent}
              {shouldShowProTip && <VariableProTip />}
            </>
          )}
          {draftReplyDeliverySection}
        </Card>
      ) : isMessagingNotification ? (
        <Card className="p-4 space-y-4">{deliverySummary}</Card>
      ) : isEmailAction || actionType === ActionType.CALL_WEBHOOK ? (
        <Card className="p-4 space-y-4">
          {deliverySummary}
          {fieldsContent}
          {shouldShowProTip && <VariableProTip />}
          {delayControls}
          {attachmentsSummary}
        </Card>
      ) : (
        <>
          {fieldsContent}
          {shouldShowProTip && <VariableProTip />}
          {delayControls}
        </>
      )}
    </>
  );

  const handleAddDelay = useCallback(() => {
    setValue(`actions.${index}.delayInMinutes`, 60, {
      shouldValidate: true,
    });
  }, [index, setValue]);

  const handleRemoveDelay = useCallback(() => {
    setValue(`actions.${index}.delayInMinutes`, null, {
      shouldValidate: true,
    });
  }, [index, setValue]);

  const handleUsePrompt = useCallback(() => {
    setValue(`actions.${index}.labelId`, {
      value: "",
      ai: true,
    });
  }, [index, setValue]);

  const handleUseLabel = useCallback(() => {
    setValue(`actions.${index}.labelId`, {
      value: "",
      ai: false,
    });
  }, [index, setValue]);

  const handleSetManually = useCallback(() => {
    setValue(`actions.${index}.content.setManually`, true);
  }, [index, setValue]);

  const handleUseAiDraft = useCallback(() => {
    setValue(`actions.${index}.content.setManually`, false);
    setValue(`actions.${index}.staticAttachments`, []);
  }, [index, setValue]);

  const isLabelAction = actionType === ActionType.LABEL;
  const labelIdValue = watch(`actions.${index}.labelId`);
  const isPromptMode = !!labelIdValue?.ai;
  const isDraftReplyAction = isDraftReplyActionType(rawActionType);
  const showDeliveryActions = isMessagingNotification;
  const showAttachmentsAction = supportsAttachments;
  const moreOptions = (
    <>
      {showDeliveryActions ? (
        <DropdownMenuItem
          onClick={(event) => {
            event.preventDefault();
            setDeliveryDialogOpen(true);
          }}
        >
          {deliverySummary ? "Delivery options" : "Configure delivery"}
        </DropdownMenuItem>
      ) : null}
      {showAttachmentsAction ? (
        <DropdownMenuItem
          onClick={(event) => {
            event.preventDefault();
            setAttachmentsDialogOpen(true);
          }}
        >
          <PaperclipIcon className="mr-2 size-4" />
          Configure attachments
        </DropdownMenuItem>
      ) : null}
    </>
  );

  return (
    <>
      <RuleStep
        onRemove={() =>
          remove(
            draftReplyGroupIndexes.length > 1 ? draftReplyGroupIndexes : index,
          )
        }
        removeAriaLabel="Remove action"
        leftContent={leftContent}
        rightContent={rightContent}
        onAddDelay={actionCanBeDelayed ? handleAddDelay : undefined}
        onRemoveDelay={actionCanBeDelayed ? handleRemoveDelay : undefined}
        hasDelay={delayEnabled}
        onUsePrompt={isLabelAction ? handleUsePrompt : undefined}
        onUseLabel={isLabelAction ? handleUseLabel : undefined}
        isPromptMode={isPromptMode}
        onSetManually={isDraftReplyAction ? handleSetManually : undefined}
        onUseAiDraft={isDraftReplyAction ? handleUseAiDraft : undefined}
        isManualMode={contentSetManually}
        extraOptions={moreOptions}
      />

      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isDraftReplyAction ? "Delivery options" : "Delivery destination"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {deliveryField}
            {connectedMessagingChannels.length === 0 &&
            canConnectMessagingApp ? (
              <div className="rounded-md border bg-muted/40 p-3 space-y-3">
                <MutedText>
                  Connect Slack, Telegram, or Teams to deliver outside email.
                </MutedText>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={prefixPath(emailAccountId, "/channels")}>
                      {getConnectAppLabel(availableMessagingProviders)}
                    </Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={attachmentsDialogOpen}
        onOpenChange={setAttachmentsDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
          </DialogHeader>
          {attachmentsField}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DraftReplyReviewChannelsSection({
  emailAccountId,
  delivery,
  selectedChannels,
  connectedChannels,
  connectAppLabel,
  errorMessage,
  onChange,
}: {
  emailAccountId: string;
  delivery: DraftReplyDelivery;
  selectedChannels: MessagingChannelOption[];
  connectedChannels: MessagingChannelOption[];
  connectAppLabel: string;
  errorMessage?: string;
  onChange: (value: {
    includeEmail: boolean;
    selectedMessagingChannelIds: string[];
  }) => void;
}) {
  const includeEmail = delivery !== "MESSAGING";
  const selectedMessagingChannelIds = selectedChannels.map(
    (channel) => channel.id,
  );
  const canToggleEmail = selectedMessagingChannelIds.length > 0;
  const hasConnectedMessagingDestination = connectedChannels.length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">Draft to</span>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 text-sm",
            !canToggleEmail && "opacity-60",
          )}
        >
          <Checkbox
            checked={includeEmail}
            disabled={!canToggleEmail}
            onCheckedChange={(checked) =>
              onChange({
                includeEmail: checked === true,
                selectedMessagingChannelIds,
              })
            }
            aria-label="Toggle email draft delivery"
          />
          <div className="min-w-0">
            <span className="font-medium text-foreground">Email</span>
            <span className="text-muted-foreground">
              {" "}
              — Draft appears in your inbox
            </span>
          </div>
        </div>

        {connectedChannels.map((channel) => {
          const channelLabel = formatDraftReplyReviewChannelLabel(channel);
          const isSelectedChannel = selectedMessagingChannelIds.includes(
            channel.id,
          );
          const canToggleChannel =
            includeEmail ||
            !isSelectedChannel ||
            selectedMessagingChannelIds.length > 1;

          return (
            <div
              key={channel.id}
              className={cn(
                "flex items-center gap-2 text-sm",
                !canToggleChannel && "opacity-60",
              )}
            >
              <Checkbox
                checked={isSelectedChannel}
                disabled={!canToggleChannel}
                onCheckedChange={(checked) => {
                  const nextSelectedMessagingChannelIds =
                    checked === true
                      ? [...selectedMessagingChannelIds, channel.id]
                      : selectedMessagingChannelIds.filter(
                          (selectedChannelId) =>
                            selectedChannelId !== channel.id,
                        );

                  onChange({
                    includeEmail,
                    selectedMessagingChannelIds:
                      nextSelectedMessagingChannelIds,
                  });
                }}
                aria-label={`Toggle ${channelLabel} draft delivery`}
              />
              <span className="font-medium text-foreground">
                {channelLabel}
              </span>
            </div>
          );
        })}
      </div>

      {!hasConnectedMessagingDestination ? (
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link href={prefixPath(emailAccountId, "/channels")}>
            {connectAppLabel}
          </Link>
        </Button>
      ) : null}

      {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
    </div>
  );
}

function MessagingChannelField({
  control,
  index,
  label,
  includeEmailOption = false,
  messagingChannels,
}: {
  control: Control<CreateRuleBody>;
  index: number;
  label: string;
  includeEmailOption?: boolean;
  messagingChannels: MessagingChannelOption[];
}) {
  return (
    <FormField
      control={control}
      name={`actions.${index}.messagingChannelId`}
      render={({ field, fieldState }) => {
        const isSelectedChannelConnected =
          !field.value ||
          messagingChannels.some((channel) => channel.id === field.value);
        const value =
          (isSelectedChannelConnected ? field.value : null) ??
          (includeEmailOption ? "email" : undefined);

        return (
          <div className="space-y-2">
            <Label>{label}</Label>
            <Select
              value={value}
              onValueChange={(nextValue) =>
                field.onChange(nextValue === "email" ? null : nextValue)
              }
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      messagingChannels.length > 0
                        ? "Choose a destination"
                        : "No connected destinations"
                    }
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {includeEmailOption ? (
                  <SelectItem value="email">Email</SelectItem>
                ) : null}
                {messagingChannels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {formatMessagingDestinationLabel(channel)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.error?.message ? (
              <ErrorMessage message={fieldState.error.message} />
            ) : null}
          </div>
        );
      }}
    />
  );
}

export function formatMessagingDestinationLabel(
  channel: MessagingChannelOption,
) {
  const provider = getMessagingProviderName(channel.provider);
  const destination = channel.destinations.ruleNotifications;

  if (destination.isDm) return `${provider} DM`;
  if (destination.targetLabel && channel.teamName) {
    return `${destination.targetLabel} (${channel.teamName})`;
  }
  if (destination.targetLabel) {
    return provider === "Slack"
      ? `${destination.targetLabel} (Slack workspace)`
      : destination.targetLabel;
  }
  if (channel.teamName) return `${provider} (${channel.teamName})`;

  return provider === "Slack" ? "Slack workspace" : provider;
}

function formatDraftReplyReviewChannelLabel(channel?: MessagingChannelOption) {
  if (!channel) return "Chat app";

  const destination = formatMessagingDestinationLabel(channel);
  const provider = getMessagingProviderName(channel.provider);
  const label =
    channel.destinations.ruleNotifications.isDm ||
    destination.startsWith(provider)
      ? destination
      : `${provider} · ${destination}`;
  return channel.isConnected ? label : `${label} (Disconnected)`;
}

function updateActionType({
  nextType,
  index,
  draftMessagingIndexes,
  primaryAction,
  setValue,
  remove,
}: {
  nextType: ActionType;
  index: number;
  draftMessagingIndexes: number[];
  primaryAction?: CreateRuleBody["actions"][number];
  setValue: ReturnType<typeof useForm<CreateRuleBody>>["setValue"];
  remove: (index?: number | number[]) => void;
}) {
  if (!primaryAction) return;

  if (nextType === ActionType.DRAFT_EMAIL) {
    setValue(`actions.${index}`, buildDraftEmailAction(primaryAction));
    if (draftMessagingIndexes.length > 0) {
      remove(draftMessagingIndexes);
    }
    return;
  }

  setValue(`actions.${index}.type`, nextType);
  setValue(`actions.${index}.messagingChannelId`, null);
  if (draftMessagingIndexes.length > 0) {
    remove(draftMessagingIndexes);
  }
}

function updateDraftReplyDelivery({
  includeEmail,
  selectedMessagingChannelIds,
  actions,
  index,
  draftMessagingIndexes,
  primaryAction,
  draftMessagingActions,
  replaceActions,
}: {
  includeEmail: boolean;
  selectedMessagingChannelIds: string[];
  actions: CreateRuleBody["actions"];
  index: number;
  draftMessagingIndexes: number[];
  primaryAction?: CreateRuleBody["actions"][number];
  draftMessagingActions: CreateRuleBody["actions"];
  replaceActions: (actions: CreateRuleBody["actions"]) => void;
}) {
  if (!primaryAction) return;

  const nextSelectedMessagingChannelIds = Array.from(
    new Set(selectedMessagingChannelIds.filter(Boolean)),
  );
  const nextIncludeEmail =
    includeEmail || nextSelectedMessagingChannelIds.length === 0;

  const sourceAction =
    primaryAction.type === ActionType.DRAFT_EMAIL
      ? primaryAction
      : (draftMessagingActions[0] ?? primaryAction);
  const existingMessagingActions = [
    primaryAction.type === ActionType.DRAFT_MESSAGING_CHANNEL
      ? primaryAction
      : null,
    ...draftMessagingActions,
  ].filter((action): action is NonNullable<CreateRuleBody["actions"][number]> =>
    Boolean(action),
  );

  const nextGroupActions: CreateRuleBody["actions"] = nextIncludeEmail
    ? [buildDraftEmailAction(sourceAction)]
    : [];

  for (const messagingChannelId of nextSelectedMessagingChannelIds) {
    const existingMessagingAction =
      existingMessagingActions.find(
        (action) => action.messagingChannelId === messagingChannelId,
      ) ?? primaryAction;

    nextGroupActions.push(
      buildDraftMessagingAction({
        action: existingMessagingAction,
        sourceAction,
        messagingChannelId,
      }),
    );
  }

  const nextActions = [
    ...actions.slice(0, index),
    ...nextGroupActions,
    ...actions.slice(index + draftMessagingIndexes.length + 1),
  ];

  replaceActions(nextActions);
}

function getMessagingChannelError({
  errors,
  actionIndexes,
}: {
  errors: FieldErrors<CreateRuleBody>;
  actionIndexes: number[];
}) {
  for (const actionIndex of actionIndexes) {
    const errorMessage =
      errors.actions?.[actionIndex]?.messagingChannelId?.message?.toString();
    if (errorMessage) return errorMessage;
  }

  return;
}

function formatDraftReplyDeliverySummary({
  delivery,
  selectedChannels,
}: {
  delivery: DraftReplyDelivery;
  selectedChannels: MessagingChannelOption[];
}) {
  if (delivery === "EMAIL") return "Email";

  const destinations = selectedChannels.map((channel) =>
    formatDraftReplyReviewChannelLabel(channel),
  );

  if (destinations.length === 0) {
    return delivery === "MESSAGING" ? "Chat app" : "Email + chat app";
  }

  const destinationSummary = destinations.join(", ");
  return delivery === "MESSAGING"
    ? destinationSummary
    : `Email + ${destinationSummary}`;
}

function VariableExamplesDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" className="ml-auto">
          See examples
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Variable Examples</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div>
            <h4 className="font-medium">Example: Subject</h4>
            <div className="mt-2 rounded-md bg-muted p-3">
              <code className="text-sm">Hi {"{{name}}"}</code>
            </div>
          </div>

          <div>
            <h4 className="font-medium">Example: Email Content</h4>
            <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
              {`Hi {{name}},

{{answer the question in the email}}

If you'd like to get on a call here's my cal link:
cal.com/example`}
            </div>
          </div>
          <div>
            <h4 className="font-medium">Example: Label</h4>
            <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
              {`{{choose between "p1", "p2", "p3" depending on urgency. "p1" is highest urgency.}}`}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VariableProTip() {
  return (
    <div className="mt-4 rounded-md bg-blue-50 p-3 dark:bg-blue-950/30">
      <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
        <span>
          ✨ Use {"{{"}variables{"}}"} for personalized content
        </span>
        <VariableExamplesDialog />
      </div>
    </div>
  );
}

function DelayInputControls({
  index,
  delayInMinutes,
  setValue,
}: {
  index: number;
  delayInMinutes: number | null | undefined;
  setValue: ReturnType<typeof useForm<CreateRuleBody>>["setValue"];
}) {
  const { value: displayValue, unit } = getDisplayValueAndUnit(delayInMinutes);

  const handleValueChange = (newValue: string, currentUnit: string) => {
    const minutes = convertToMinutes(newValue, currentUnit);
    setValue(`actions.${index}.delayInMinutes`, minutes, {
      shouldValidate: true,
    });
  };

  const handleUnitChange = (newUnit: string) => {
    if (displayValue) {
      const minutes = convertToMinutes(displayValue, newUnit);
      setValue(`actions.${index}.delayInMinutes`, minutes);
    }
  };

  const delayConfig = {
    displayValue,
    unit,
    handleValueChange,
    handleUnitChange,
  };

  return (
    <div className="flex items-center space-x-2">
      <Input
        name={`delay-${index}`}
        type="text"
        placeholder="0"
        className="w-20"
        registerProps={{
          value: delayConfig.displayValue,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value.replace(/[^0-9]/g, "");
            delayConfig.handleValueChange(value, delayConfig.unit);
          },
        }}
      />
      <Select
        value={delayConfig.unit}
        onValueChange={delayConfig.handleUnitChange}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">
            {delayInMinutes === 1 ? "Minute" : "Minutes"}
          </SelectItem>
          <SelectItem value="hours">
            {delayInMinutes === 60 ? "Hour" : "Hours"}
          </SelectItem>
          <SelectItem value="days">
            {delayInMinutes === 1440 ? "Day" : "Days"}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function renderFieldRows(
  fields: Array<(typeof actionInputs)[ActionType]["fields"][number]>,
  renderField: (
    field: (typeof actionInputs)[ActionType]["fields"][number],
  ) => ReactNode,
) {
  const rows: ReactNode[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const nextField = fields[index + 1];

    if (field.name === "cc" && nextField?.name === "bcc") {
      const renderedField = renderField(field);
      const renderedNextField = renderField(nextField);

      if (renderedField && renderedNextField) {
        rows.push(
          <div
            key={`${field.name}-${nextField.name}`}
            className="grid gap-4 sm:grid-cols-2"
          >
            {renderedField}
            {renderedNextField}
          </div>,
        );
      } else {
        if (renderedField) rows.push(renderedField);
        if (renderedNextField) rows.push(renderedNextField);
      }

      index += 1;
      continue;
    }

    rows.push(renderField(field));
  }

  return rows;
}

// minutes to user-friendly UI format
function getDisplayValueAndUnit(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined)
    return { value: "", unit: "hours" };
  if (minutes === -1 || minutes <= 0) return { value: "", unit: "hours" };

  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: (minutes / 1440).toString(), unit: "days" };
  } else if (minutes >= 60 && minutes % 60 === 0) {
    return { value: (minutes / 60).toString(), unit: "hours" };
  } else {
    return { value: minutes.toString(), unit: "minutes" };
  }
}

// user-friendly UI format to minutes
function convertToMinutes(value: string, unit: string) {
  const numValue = Number.parseInt(value, 10);
  if (Number.isNaN(numValue) || numValue <= 0) return -1;

  switch (unit) {
    case "minutes":
      return numValue;
    case "hours":
      return numValue * 60;
    case "days":
      return numValue * 1440;
    default:
      return numValue;
  }
}
