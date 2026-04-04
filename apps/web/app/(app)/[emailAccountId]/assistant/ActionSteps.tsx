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
import type { EmailLabel } from "@/providers/EmailProvider";
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
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import { prefixPath } from "@/utils/path";
import { isDraftReplyActionType } from "@/utils/actions/draft-reply";
import {
  buildDraftEmailAction,
  buildDraftMessagingAction,
  buildVisibleDraftReplyGroups,
  getDraftReplyDelivery,
  getDraftReplyMessagingChannelId,
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
  insert,
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
  insert: (index: number, action: CreateRuleBody["actions"][number]) => void;
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
      {visibleActionGroups.map(({ primaryIndex, draftMessagingIndex }) => (
        <ActionCard
          key={actionFields[primaryIndex]?.id ?? `action-${primaryIndex}`}
          index={primaryIndex}
          draftMessagingIndex={draftMessagingIndex}
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
          insert={insert}
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
  draftMessagingIndex,
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
  insert,
  typeOptions,
  folders,
  foldersLoading,
  messagingChannels,
  availableMessagingProviders,
  attachmentSources,
  onAttachmentSourcesChange,
}: {
  index: number;
  draftMessagingIndex: number | null;
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
  insert: (index: number, action: CreateRuleBody["actions"][number]) => void;
  typeOptions: { label: string; value: ActionType; icon: React.ElementType }[];
  folders: OutlookFolder[];
  foldersLoading: boolean;
  messagingChannels: MessagingChannelOption[];
  availableMessagingProviders: MessagingProviderOption[];
  attachmentSources: AttachmentSourceInput[];
  onAttachmentSourcesChange: (value: AttachmentSourceInput[]) => void;
}) {
  const primaryAction = watch(`actions.${index}`);
  const draftMessagingAction =
    draftMessagingIndex != null
      ? watch(`actions.${draftMessagingIndex}`)
      : undefined;
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
  const selectedMessagingChannelId = getDraftReplyMessagingChannelId({
    primaryAction,
    draftMessagingAction,
  });
  const selectedMessagingChannel = messagingChannels.find(
    (channel) => channel.id === selectedMessagingChannelId,
  );
  const draftReplyDelivery = getDraftReplyDelivery({
    primaryAction,
    draftMessagingAction,
  });
  const deliveryErrorMessage = getMessagingChannelError({
    errors,
    primaryIndex: index,
    draftMessagingIndex,
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
            draftMessagingIndex,
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

  const connectedMessagingChannels = messagingChannels.filter(
    (channel) => channel.isConnected && channel.hasSendDestination,
  );
  const canConnectMessagingApp = availableMessagingProviders.length > 0;

  const deliveryField = isDraftReplyActionType(rawActionType) ? (
    <DraftReplyDeliveryField
      label="Deliver to"
      delivery={draftReplyDelivery}
      messagingChannels={connectedMessagingChannels}
      selectedChannelId={selectedMessagingChannelId}
      selectedChannel={selectedMessagingChannel}
      errorMessage={deliveryErrorMessage}
      onChange={(nextValue) =>
        updateDraftReplyDelivery({
          delivery: nextValue,
          index,
          draftMessagingIndex,
          primaryAction,
          draftMessagingAction,
          selectedChannelId: selectedMessagingChannelId,
          setValue,
          insert,
          remove,
          fallbackChannelId: connectedMessagingChannels[0]?.id ?? null,
        })
      }
    />
  ) : isMessagingNotification ? (
    <MessagingChannelField
      control={control}
      index={index}
      label="Send to"
      messagingChannels={connectedMessagingChannels}
      selectedChannel={selectedMessagingChannel}
    />
  ) : null;

  const deliverySummary = isDraftReplyActionType(rawActionType) ? (
    <MutedText className="px-1">
      Deliver to{" "}
      <span className="font-medium text-foreground">
        {formatDraftReplyDeliverySummary({
          delivery: draftReplyDelivery,
          selectedChannel: selectedMessagingChannel,
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
      includeMessaging,
      messagingChannelId,
    }: {
      includeEmail: boolean;
      includeMessaging: boolean;
      messagingChannelId: string | null;
    }) => {
      if (!includeEmail && !includeMessaging) return;

      updateDraftReplyDelivery({
        delivery: {
          delivery: includeEmail
            ? includeMessaging
              ? "EMAIL_AND_MESSAGING"
              : "EMAIL"
            : "MESSAGING",
          messagingChannelId,
        },
        index,
        draftMessagingIndex,
        primaryAction,
        draftMessagingAction,
        selectedChannelId: selectedMessagingChannelId,
        setValue,
        insert,
        remove,
        fallbackChannelId: connectedMessagingChannels[0]?.id ?? null,
      });
    },
    [
      connectedMessagingChannels,
      draftMessagingAction,
      draftMessagingIndex,
      index,
      insert,
      primaryAction,
      remove,
      selectedMessagingChannelId,
      setValue,
    ],
  );

  const draftReplyDeliverySection = isDraftReplyActionType(rawActionType) ? (
    <div className="space-y-4 border-t border-border pt-4">
      <DraftReplyReviewChannelsSection
        emailAccountId={emailAccountId}
        delivery={draftReplyDelivery}
        selectedChannel={selectedMessagingChannel}
        connectedChannels={connectedMessagingChannels}
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
            draftMessagingIndex != null ? [index, draftMessagingIndex] : index,
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
                      Connect app
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

function DraftReplyDeliveryField({
  label,
  delivery,
  messagingChannels,
  selectedChannelId,
  selectedChannel,
  errorMessage,
  onChange,
}: {
  label: string;
  delivery: DraftReplyDelivery;
  messagingChannels: MessagingChannelOption[];
  selectedChannelId: string | null;
  selectedChannel?: MessagingChannelOption;
  errorMessage?: string;
  onChange: (value: DraftReplyDeliverySelection) => void;
}) {
  const options = buildDraftReplyDeliveryOptions({
    messagingChannels,
    selectedChannelId,
    selectedChannel,
  });
  const selectedValue =
    options.find(
      (option) =>
        option.delivery === delivery &&
        option.messagingChannelId === selectedChannelId,
    )?.value ?? (delivery === "EMAIL" ? "email" : undefined);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={selectedValue}
        onValueChange={(nextValue) =>
          onChange(parseDraftReplyDeliverySelection(nextValue))
        }
      >
        <FormControl>
          <SelectTrigger>
            <SelectValue
              placeholder={
                messagingChannels.length > 0 ? "Choose a destination" : "Email"
              }
            />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
    </div>
  );
}

function DraftReplyReviewChannelsSection({
  emailAccountId,
  delivery,
  selectedChannel,
  connectedChannels,
  errorMessage,
  onChange,
}: {
  emailAccountId: string;
  delivery: DraftReplyDelivery;
  selectedChannel?: MessagingChannelOption;
  connectedChannels: MessagingChannelOption[];
  errorMessage?: string;
  onChange: (value: {
    includeEmail: boolean;
    includeMessaging: boolean;
    messagingChannelId: string | null;
  }) => void;
}) {
  const availableChannels = [...connectedChannels];
  if (
    selectedChannel &&
    !availableChannels.some((channel) => channel.id === selectedChannel.id)
  ) {
    availableChannels.push(selectedChannel);
  }

  const includeEmail = delivery !== "MESSAGING";
  const includeMessaging = delivery !== "EMAIL";
  const canToggleEmail = includeMessaging;
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
                includeMessaging,
                messagingChannelId: selectedChannel?.id ?? null,
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

        {availableChannels.map((channel) => {
          const channelLabel = formatDraftReplyReviewChannelLabel(channel);
          const isSelectedChannel =
            includeMessaging && selectedChannel?.id === channel.id;
          const canToggleChannel = includeEmail || !isSelectedChannel;

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
                onCheckedChange={(checked) =>
                  onChange({
                    includeEmail,
                    includeMessaging: checked === true,
                    messagingChannelId:
                      checked === true
                        ? channel.id
                        : (selectedChannel?.id ?? null),
                  })
                }
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
            Connect app
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
  selectedChannel,
}: {
  control: Control<CreateRuleBody>;
  index: number;
  label: string;
  includeEmailOption?: boolean;
  messagingChannels: MessagingChannelOption[];
  selectedChannel?: MessagingChannelOption;
}) {
  return (
    <FormField
      control={control}
      name={`actions.${index}.messagingChannelId`}
      render={({ field, fieldState }) => {
        const value = field.value ?? (includeEmailOption ? "email" : undefined);
        const showDisconnectedOption =
          !!selectedChannel &&
          !messagingChannels.some(
            (channel) => channel.id === selectedChannel.id,
          );

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
                {showDisconnectedOption && selectedChannel ? (
                  <SelectItem value={selectedChannel.id}>
                    {formatMessagingDestinationLabel(selectedChannel)}{" "}
                    (Disconnected)
                  </SelectItem>
                ) : null}
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

function formatMessagingDestinationLabel(channel: MessagingChannelOption) {
  const provider = getMessagingProviderName(channel.provider);

  if (channel.isDm) return `${provider} DM`;
  if (channel.channelName && channel.teamName) {
    return `#${channel.channelName} (${channel.teamName})`;
  }
  if (channel.channelName) return `#${channel.channelName}`;
  if (channel.teamName) return `${provider} (${channel.teamName})`;

  return provider === "Slack" ? "Slack workspace" : provider;
}

function formatDraftReplyReviewChannelLabel(channel?: MessagingChannelOption) {
  if (!channel) return "Chat app";

  const destination = formatMessagingDestinationLabel(channel);
  const provider = getMessagingProviderName(channel.provider);
  const label =
    channel.isDm || destination.startsWith(provider)
      ? destination
      : `${provider} · ${destination}`;
  return channel.isConnected ? label : `${label} (Disconnected)`;
}

type DraftReplyDeliverySelection = {
  delivery: DraftReplyDelivery;
  messagingChannelId: string | null;
};

function updateActionType({
  nextType,
  index,
  draftMessagingIndex,
  primaryAction,
  setValue,
  remove,
}: {
  nextType: ActionType;
  index: number;
  draftMessagingIndex: number | null;
  primaryAction?: CreateRuleBody["actions"][number];
  setValue: ReturnType<typeof useForm<CreateRuleBody>>["setValue"];
  remove: (index?: number | number[]) => void;
}) {
  if (!primaryAction) return;

  if (nextType === ActionType.DRAFT_EMAIL) {
    setValue(`actions.${index}`, buildDraftEmailAction(primaryAction));
    if (draftMessagingIndex != null) {
      remove(draftMessagingIndex);
    }
    return;
  }

  setValue(`actions.${index}.type`, nextType);
  setValue(`actions.${index}.messagingChannelId`, null);
  if (draftMessagingIndex != null) {
    remove(draftMessagingIndex);
  }
}

function updateDraftReplyDelivery({
  delivery,
  index,
  draftMessagingIndex,
  primaryAction,
  draftMessagingAction,
  selectedChannelId,
  setValue,
  insert,
  remove,
  fallbackChannelId,
}: {
  delivery: DraftReplyDeliverySelection;
  index: number;
  draftMessagingIndex: number | null;
  primaryAction?: CreateRuleBody["actions"][number];
  draftMessagingAction?: CreateRuleBody["actions"][number];
  selectedChannelId: string | null;
  setValue: ReturnType<typeof useForm<CreateRuleBody>>["setValue"];
  insert: (index: number, action: CreateRuleBody["actions"][number]) => void;
  remove: (index?: number | number[]) => void;
  fallbackChannelId: string | null;
}) {
  if (!primaryAction) return;

  const messagingChannelId =
    delivery.messagingChannelId ?? selectedChannelId ?? fallbackChannelId;

  if (delivery.delivery === "EMAIL") {
    setValue(`actions.${index}`, buildDraftEmailAction(primaryAction));
    if (draftMessagingIndex != null) {
      remove(draftMessagingIndex);
    }
    return;
  }

  if (delivery.delivery === "MESSAGING") {
    setValue(
      `actions.${index}`,
      buildDraftMessagingAction({
        action: primaryAction,
        sourceAction: primaryAction,
        messagingChannelId,
      }),
    );
    if (draftMessagingIndex != null) {
      remove(draftMessagingIndex);
    }
    return;
  }

  setValue(`actions.${index}`, buildDraftEmailAction(primaryAction));
  const nextDraftMessagingAction = buildDraftMessagingAction({
    action: draftMessagingAction ?? primaryAction,
    sourceAction: primaryAction,
    messagingChannelId,
  });

  if (draftMessagingIndex != null) {
    setValue(`actions.${draftMessagingIndex}`, nextDraftMessagingAction);
    return;
  }

  insert(index + 1, nextDraftMessagingAction);
}

function getMessagingChannelError({
  errors,
  primaryIndex,
  draftMessagingIndex,
}: {
  errors: FieldErrors<CreateRuleBody>;
  primaryIndex: number;
  draftMessagingIndex: number | null;
}) {
  return (
    errors.actions?.[
      draftMessagingIndex ?? primaryIndex
    ]?.messagingChannelId?.message?.toString() || undefined
  );
}

function formatDraftReplyDeliverySummary({
  delivery,
  selectedChannel,
}: {
  delivery: DraftReplyDelivery;
  selectedChannel?: MessagingChannelOption;
}) {
  if (delivery === "EMAIL") return "Email";
  if (!selectedChannel) {
    return delivery === "MESSAGING" ? "Chat app" : "Email + chat app";
  }

  const destination = formatDraftReplyReviewChannelLabel(selectedChannel);
  return delivery === "MESSAGING" ? destination : `Email + ${destination}`;
}

function buildDraftReplyDeliveryOptions({
  messagingChannels,
  selectedChannelId,
  selectedChannel,
}: {
  messagingChannels: MessagingChannelOption[];
  selectedChannelId: string | null;
  selectedChannel?: MessagingChannelOption;
}) {
  const options: Array<{
    value: string;
    label: string;
    delivery: DraftReplyDelivery;
    messagingChannelId: string | null;
  }> = [
    {
      value: "email",
      label: "Email",
      delivery: "EMAIL",
      messagingChannelId: null,
    },
  ];

  const channels = [...messagingChannels];
  if (
    selectedChannelId &&
    selectedChannel &&
    !channels.some((channel) => channel.id === selectedChannelId)
  ) {
    channels.push(selectedChannel);
  }

  for (const channel of channels) {
    const destination = formatDraftReplyReviewChannelLabel(channel);
    options.push({
      value: `messaging:${channel.id}`,
      label: destination,
      delivery: "MESSAGING",
      messagingChannelId: channel.id,
    });
    options.push({
      value: `email+messaging:${channel.id}`,
      label: `Email + ${destination}`,
      delivery: "EMAIL_AND_MESSAGING",
      messagingChannelId: channel.id,
    });
  }

  return options;
}

function parseDraftReplyDeliverySelection(
  value: string,
): DraftReplyDeliverySelection {
  if (value === "email") {
    return { delivery: "EMAIL", messagingChannelId: null };
  }

  const [delivery, messagingChannelId] = value.split(":");
  return {
    delivery:
      delivery === "email+messaging" ? "EMAIL_AND_MESSAGING" : "MESSAGING",
    messagingChannelId: messagingChannelId || null,
  };
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
