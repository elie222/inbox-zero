"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type FieldErrors,
  type SubmitHandler,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import { usePostHog } from "posthog-js/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  TrashIcon,
  MailIcon,
  BotIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorMessage, Input } from "@/components/Input";
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
import { actionInputs } from "@/utils/action-item";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { useLabels } from "@/hooks/useLabels";
import { hasVariables, TEMPLATE_VARIABLE_PATTERN } from "@/utils/template";
import { AlertError } from "@/components/Alert";
import { LearnedPatternsDialog } from "@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { useRule } from "@/hooks/useRule";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { getEmailTerminology } from "@/utils/terminology";
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
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { canActionBeDelayed } from "@/utils/delayed-actions";
import { getActionIcon } from "@/utils/action-display";
import type { EmailLabel } from "@/providers/EmailProvider";
import { FolderSelector } from "@/components/FolderSelector";
import { useFolders } from "@/hooks/useFolders";
import type { OutlookFolder } from "@/utils/outlook/folders";
import { cn } from "@/utils";
import { WebhookDocumentationLink } from "@/components/WebhookDocumentation";
import { LabelCombobox } from "@/components/LabelCombobox";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import { RuleSectionCard } from "@/app/(app)/[emailAccountId]/assistant/RuleSectionCard";
import { ConditionSteps } from "@/app/(app)/[emailAccountId]/assistant/ConditionSteps";
import { ActionSteps } from "@/app/(app)/[emailAccountId]/assistant/ActionSteps";
import { RuleStep } from "@/app/(app)/[emailAccountId]/assistant/RuleStep";

export function Rule({
  ruleId,
  alwaysEditMode = false,
}: {
  ruleId: string;
  alwaysEditMode?: boolean;
}) {
  const { data, isLoading, error, mutate } = useRule(ruleId);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <RuleForm
          rule={data.rule}
          alwaysEditMode={alwaysEditMode}
          mutate={mutate}
        />
      )}
    </LoadingContent>
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
  rule: CreateRuleBody & { id?: string };
  alwaysEditMode?: boolean;
  onSuccess?: () => void;
  isDialog?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: lazy
  mutate?: (data?: any, options?: any) => void;
  onCancel?: () => void;
}) {
  const { emailAccountId, provider } = useAccount();

  const form = useForm<CreateRuleBody>({
    resolver: zodResolver(createRuleBody),
    defaultValues: rule
      ? {
          ...rule,
          digest: rule.actions.some(
            (action) => action.type === ActionType.DIGEST,
          ),
          actions: [
            ...rule.actions
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
    formState: { errors, isSubmitting, isSubmitted },
    trigger,
  } = form;

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition,
  } = useFieldArray({
    control,
    name: "conditions",
  });
  const { append, remove } = useFieldArray({ control, name: "actions" });

  const { userLabels, isLoading, mutate: mutateLabels } = useLabels();
  const { folders, isLoading: foldersLoading } = useFolders(provider);
  const router = useRouter();

  const posthog = usePostHog();

  const onSubmit: SubmitHandler<CreateRuleBody> = useCallback(
    async (data) => {
      // set content to empty string if it's not set manually
      for (const action of data.actions) {
        if (action.type === ActionType.DRAFT_EMAIL) {
          if (!action.content?.setManually) {
            action.content = { value: "", ai: false };
          }
        }
      }

      // Add DIGEST action if digest is enabled
      const actionsToSubmit = [...data.actions];
      if (data.digest) {
        actionsToSubmit.push({ type: ActionType.DIGEST });
      }

      if (data.id) {
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
          actions: actionsToSubmit,
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
          toastSuccess({ description: "Saved!" });
          // Revalidate to get the real data from server
          if (mutate) mutate();
          posthog.capture("User updated AI rule", {
            conditions: data.conditions.map((condition) => condition.type),
            actions: actionsToSubmit.map((action) => action.type),
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
          toastSuccess({ description: "Created!" });
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
            router.push(prefixPath(emailAccountId, "/assistant?tab=rules"));
          }
        }
      }
    },
    [router, posthog, emailAccountId, isDialog, onSuccess, mutate, rule],
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
        errors?.actions?.[index]?.url?.root?.message ||
        errors?.actions?.[index]?.labelId?.root?.message ||
        errors?.actions?.[index]?.to?.root?.message;
      if (actionError) actionErrors.push(actionError);
    });
    return actionErrors;
  }, [errors, watch]);

  const conditionalOperator = watch("conditionalOperator");
  const terminology = getEmailTerminology(provider);

  const typeOptions = useMemo(() => {
    const options: {
      label: string;
      value: ActionType;
      icon: React.ElementType;
    }[] = [
      {
        label: "Archive",
        value: ActionType.ARCHIVE,
        icon: getActionIcon(ActionType.ARCHIVE),
      },
      {
        label: terminology.label.action,
        value: ActionType.LABEL,
        icon: getActionIcon(ActionType.LABEL),
      },
      ...(isMicrosoftProvider(provider)
        ? [
            {
              label: "Move to folder",
              value: ActionType.MOVE_FOLDER,
              icon: getActionIcon(ActionType.MOVE_FOLDER),
            },
          ]
        : []),
      {
        label: "Draft reply",
        value: ActionType.DRAFT_EMAIL,
        icon: getActionIcon(ActionType.DRAFT_EMAIL),
      },
      {
        label: "Reply",
        value: ActionType.REPLY,
        icon: getActionIcon(ActionType.REPLY),
      },
      {
        label: "Send email",
        value: ActionType.SEND_EMAIL,
        icon: getActionIcon(ActionType.SEND_EMAIL),
      },
      {
        label: "Forward",
        value: ActionType.FORWARD,
        icon: getActionIcon(ActionType.FORWARD),
      },
      {
        label: "Mark read",
        value: ActionType.MARK_READ,
        icon: getActionIcon(ActionType.MARK_READ),
      },
      {
        label: "Mark spam",
        value: ActionType.MARK_SPAM,
        icon: getActionIcon(ActionType.MARK_SPAM),
      },
      {
        label: "Call webhook",
        value: ActionType.CALL_WEBHOOK,
        icon: getActionIcon(ActionType.CALL_WEBHOOK),
      },
    ];

    return options;
  }, [provider, terminology.label.action]);

  const [isNameEditMode, setIsNameEditMode] = useState(alwaysEditMode);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleNameEditMode = useCallback(() => {
    if (!alwaysEditMode) {
      setIsNameEditMode((prev: boolean) => !prev);
    }
  }, [alwaysEditMode]);

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {isSubmitted && Object.keys(errors).length > 0 && (
          <div className="mt-4">
            <AlertError
              title="Error"
              description={
                <ul className="list-disc">
                  {Object.values(errors).map((error) => (
                    <li key={error.message}>{error.message}</li>
                  ))}
                </ul>
              }
            />
          </div>
        )}

        <div className="mt-4">
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
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
          title="When an email is received"
          description="When a new email is received into your inbox"
          headerActions={undefined}
          errors={
            errors.conditions?.root?.message ? (
              <AlertError
                title="Error"
                description={errors.conditions.root.message}
              />
            ) : undefined
          }
          footerActions={undefined}
        >
          <ConditionSteps
            conditionFields={conditionFields}
            conditionalOperator={conditionalOperator}
            removeCondition={removeCondition}
            control={control}
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
          iconBg="bg-green-100 dark:bg-green-900/30"
          iconColor="text-green-600 dark:text-green-400"
          title="Then"
          description="Choose actions for your assistant to perform"
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
          footerActions={undefined}
        >
          <ActionSteps
            actions={watch("actions") || []}
            register={register}
            watch={watch}
            setValue={setValue}
            control={control}
            errors={errors}
            userLabels={userLabels}
            isLoading={isLoading}
            mutate={mutateLabels}
            emailAccountId={emailAccountId}
            remove={remove}
            typeOptions={typeOptions}
            folders={folders}
            foldersLoading={foldersLoading}
            append={append}
          />
        </RuleSectionCard>

        <div className="space-y-4 mt-8">
          <TypographyH3 className="text-xl">Settings</TypographyH3>

          <div className="flex items-center space-x-2">
            <Toggle
              name="runOnThreads"
              labelRight="Apply to threads"
              enabled={watch("runOnThreads") || false}
              onChange={(enabled) => {
                setValue("runOnThreads", enabled);
              }}
              disabled={!allowMultipleConditions(rule.systemType)}
            />

            <ThreadsExplanation size="md" />
          </div>

          <div className="flex items-center space-x-2">
            <Toggle
              name="digest"
              labelRight="Include in daily digest"
              enabled={watch("digest") || false}
              onChange={(enabled) => {
                setValue("digest", enabled);
              }}
            />

            <TooltipExplanation
              size="md"
              side="right"
              text="When enabled you will receive a summary of the emails that match this rule in your digest email."
            />
          </div>

          {!!rule.id && (
            <div className="flex">
              <LearnedPatternsDialog
                ruleId={rule.id}
                groupId={rule.groupId || null}
                disabled={!allowMultipleConditions(rule.systemType)}
              />
            </div>
          )}

          {rule.id && (
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
                    const result = await deleteRuleAction(emailAccountId, {
                      id: rule.id!,
                    });
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
                        prefixPath(emailAccountId, "/automation?tab=rules"),
                      );
                    }
                  } catch {
                    toastError({ description: "Failed to delete rule." });
                  } finally {
                    setIsDeleting(false);
                  }
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-6">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}

          {rule.id ? (
            <Button type="submit" loading={isSubmitting} disabled={isDeleting}>
              Save
            </Button>
          ) : (
            <Button type="submit" loading={isSubmitting}>
              Create
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

export function ActionCard({
  action,
  index,
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
  typeOptions,
  folders,
  foldersLoading,
}: {
  action: CreateRuleBody["actions"][number];
  index: number;
  register: ReturnType<typeof useForm<CreateRuleBody>>["register"];
  watch: ReturnType<typeof useForm<CreateRuleBody>>["watch"];
  setValue: ReturnType<typeof useForm<CreateRuleBody>>["setValue"];
  control: ReturnType<typeof useForm<CreateRuleBody>>["control"];
  errors: FieldErrors<CreateRuleBody>;
  userLabels: EmailLabel[];
  isLoading: boolean;
  mutate: () => Promise<unknown>;
  emailAccountId: string;
  remove: (index: number) => void;
  typeOptions: { label: string; value: ActionType; icon: React.ElementType }[];
  folders: OutlookFolder[];
  foldersLoading: boolean;
}) {
  const fields = actionInputs[action.type].fields;
  const [expandedFields, setExpandedFields] = useState(false);

  // Get expandable fields that should be visible regardless of expanded state
  const hasExpandableFields = fields.some((field) => field.expandable);

  // Precompute content setManually state
  const contentSetManually =
    action.type === ActionType.DRAFT_EMAIL
      ? !!watch(`actions.${index}.content.setManually`)
      : false;

  const actionCanBeDelayed = useMemo(
    () => canActionBeDelayed(action.type),
    [action.type],
  );

  const delayValue = watch(`actions.${index}.delayInMinutes`);
  const delayEnabled = !!delayValue;

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

    // For draft email content, only allow variables if set manually
    if (field.name === "content" && action.type === ActionType.DRAFT_EMAIL) {
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

    // Get field value for zodField objects
    const value = watch(`actions.${index}.${field.name}.value`);
    const isFieldVisible = !field.expandable || expandedFields || !!value;

    if (!isFieldVisible) return false;

    // For labelId field, only show variables if AI generated is toggled on
    if (field.name === "labelId") {
      return !!action[field.name]?.ai;
    }

    // For draft email content, only show variables if set manually
    if (field.name === "content" && action.type === ActionType.DRAFT_EMAIL) {
      return contentSetManually;
    }

    // For other fields, show if they're visible
    return true;
  });

  const leftContent = (
    <FormField
      control={control}
      name={`actions.${index}.type`}
      render={({ field }) => {
        const selectedOption = typeOptions.find(
          (opt) => opt.value === field.value,
        );
        const SelectedIcon = selectedOption?.icon;

        return (
          <FormItem>
            <div className="flex items-center gap-2">
              {index ? <p className="text-muted-foreground">and</p> : null}
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-[180px]">
                    {selectedOption ? (
                      <div className="flex items-center gap-2">
                        {SelectedIcon && <SelectedIcon className="size-4" />}
                        <span>{selectedOption.label}</span>
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
            </div>
          </FormItem>
        );
      }}
    />
  );

  const rightContent = (
    <>
      {fields.map((field) => {
        const isAiGenerated = !!action[field.name]?.ai;
        // For AI-generated labelId, read from .name instead of .value
        const value =
          field.name === "labelId" && isAiGenerated
            ? watch(`actions.${index}.${field.name}.name`) || ""
            : watch(`actions.${index}.${field.name}.value`) || "";
        const setManually = !!watch(
          `actions.${index}.${field.name}.setManually`,
        );

        // Show field if it's not expandable, or it's expanded, or it has a value
        const showField = !field.expandable || expandedFields || !!value;

        if (!showField) return null;

        return (
          <div
            key={field.name}
            className={cn(
              "space-y-4 mx-auto w-full",
              field.expandable && !value ? "opacity-80" : "",
            )}
          >
            <div>
              {field.name === "labelId" && !isAiGenerated ? (
                <LabelCombobox
                  userLabels={userLabels || []}
                  isLoading={isLoading}
                  mutate={mutate}
                  value={{
                    id: value,
                    name: action.labelId?.name || null,
                  }}
                  onChangeValue={(newValue: string) => {
                    setValue(`actions.${index}.${field.name}.value`, newValue);
                  }}
                  emailAccountId={emailAccountId}
                />
              ) : field.name === "labelId" && isAiGenerated ? (
                <div className="mt-2">
                  <Input
                    type="text"
                    name={`actions.${index}.${field.name}.name`}
                    registerProps={register(
                      `actions.${index}.${field.name}.name`,
                    )}
                  />
                </div>
              ) : field.name === "folderName" &&
                action.type === ActionType.MOVE_FOLDER ? (
                <div className="mt-2">
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
                action.type === ActionType.DRAFT_EMAIL &&
                !setManually ? (
                <div className="mt-2 flex h-full flex-col items-center justify-center gap-2 p-4 border rounded">
                  <div className="max-w-sm text-center text-sm text-muted-foreground">
                    Our AI will generate a reply based on your email history and
                    knowledge base
                  </div>

                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => {
                      setValue(`actions.${index}.content.setManually`, true);
                    }}
                  >
                    Set manually
                  </Button>
                </div>
              ) : field.textArea ? (
                <div className="mt-2">
                  <TextareaAutosize
                    className="block w-full flex-1 whitespace-pre-wrap rounded-md border border-border bg-background shadow-sm focus:border-black focus:ring-black sm:text-sm"
                    minRows={3}
                    rows={3}
                    {...register(`actions.${index}.${field.name}.value`)}
                  />

                  {field.name === "content" &&
                    action.type === ActionType.DRAFT_EMAIL &&
                    setManually && (
                      <Button
                        variant="link"
                        size="xs"
                        onClick={() => {
                          setValue(
                            `actions.${index}.content.setManually`,
                            false,
                          );
                        }}
                      >
                        Auto draft
                      </Button>
                    )}
                </div>
              ) : (
                <div className="mt-2">
                  <Input
                    type="text"
                    name={`actions.${index}.${field.name}.value`}
                    registerProps={register(
                      `actions.${index}.${field.name}.value`,
                    )}
                    placeholder={field.placeholder}
                  />
                  {field.name === "url" &&
                    action.type === ActionType.CALL_WEBHOOK && (
                      <div className="mt-2">
                        <WebhookDocumentationLink />
                      </div>
                    )}
                </div>
              )}

              {field.name === "labelId" && (
                <div className="flex items-center space-x-2 mt-4">
                  <Toggle
                    name={`actions.${index}.${field.name}.ai`}
                    labelRight="AI generated"
                    enabled={isAiGenerated || false}
                    onChange={(enabled) => {
                      setValue(
                        `actions.${index}.${field.name}`,
                        enabled
                          ? { value: "", ai: true }
                          : { value: "", ai: false },
                      );
                    }}
                  />

                  <TooltipExplanation
                    side="right"
                    text="When enabled our AI will generate a value when processing the email. Put the prompt inside braces like so: {{your prompt here}}."
                  />
                </div>
              )}
            </div>
            {hasVariables(value) &&
              canFieldUseVariables(field, isAiGenerated) && (
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
      })}

      {shouldShowProTip && <VariableProTip />}
      {actionCanBeDelayed && (
        <div className="">
          {action.type === ActionType.ARCHIVE ? (
            <div className="space-y-2">
              <div className="flex items-center space-x-4">
                <Select
                  value={delayEnabled ? "after" : "immediately"}
                  onValueChange={(value) => {
                    if (value === "after") {
                      setValue(`actions.${index}.delayInMinutes`, 60, {
                        shouldValidate: true,
                      });
                    } else {
                      setValue(`actions.${index}.delayInMinutes`, null, {
                        shouldValidate: true,
                      });
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediately">Immediately</SelectItem>
                    <SelectItem value="after">After</SelectItem>
                  </SelectContent>
                </Select>
                {delayEnabled && (
                  <DelayInputControls
                    index={index}
                    delayInMinutes={delayValue}
                    setValue={setValue}
                  />
                )}
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
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Toggle
                  name={`actions.${index}.delayEnabled`}
                  labelRight="Delay"
                  enabled={delayEnabled}
                  onChange={(enabled: boolean) => {
                    const newValue = enabled ? 60 : null;
                    setValue(`actions.${index}.delayInMinutes`, newValue, {
                      shouldValidate: true,
                    });
                  }}
                />
                <TooltipExplanation
                  text="Delay this action to run later. Perfect for auto-archiving newsletters after you've had time to read them, or cleaning up notifications after a few days."
                  side="right"
                />
              </div>

              {delayEnabled && (
                <DelayInputControls
                  index={index}
                  delayInMinutes={delayValue}
                  setValue={setValue}
                />
              )}
            </div>
          )}

          {action.type !== ActionType.ARCHIVE &&
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
      )}

      {hasExpandableFields && (
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
      )}
    </>
  );

  return (
    <RuleStep
      onRemove={() => remove(index)}
      removeAriaLabel="Remove action"
      leftContent={leftContent}
      rightContent={rightContent}
    />
  );
}

export function StepNumber({ number }: { number: number }) {
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {number}
    </div>
  );
}

export function ThreadsExplanation({ size }: { size: "sm" | "md" }) {
  return (
    <TooltipExplanation
      size={size}
      side="right"
      text="When enabled, this rule can apply to the first email and any subsequent replies in a conversation. When disabled, it can only apply to the first email."
    />
  );
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
    <div className="flex items-center space-x-4">
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

function allowMultipleConditions(systemType: SystemType | null | undefined) {
  return (
    systemType !== SystemType.COLD_EMAIL &&
    !isConversationStatusType(systemType)
  );
}
