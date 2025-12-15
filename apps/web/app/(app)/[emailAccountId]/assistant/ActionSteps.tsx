import { useCallback, useMemo, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type {
  useForm,
  Control,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
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
import { canActionBeDelayed } from "@/utils/delayed-actions";
import { FolderSelector } from "@/components/FolderSelector";
import { cn } from "@/utils";
import { WebhookDocumentationLink } from "@/components/WebhookDocumentation";
import { LabelCombobox } from "@/components/LabelCombobox";
import { RuleStep } from "@/app/(app)/[emailAccountId]/assistant/RuleStep";
import { Card } from "@/components/ui/card";

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
  typeOptions,
  folders,
  foldersLoading,
  append,
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
  remove: (index: number) => void;
  typeOptions: { label: string; value: ActionType; icon: React.ElementType }[];
  folders: OutlookFolder[];
  foldersLoading: boolean;
  append: (action: CreateRuleBody["actions"][number]) => void;
}) {
  return (
    <RuleSteps
      onAdd={() => append({ type: ActionType.LABEL })}
      addButtonLabel="Add Action"
      addButtonDisabled={false}
    >
      {actionFields?.map((field, i) => (
        <ActionCard
          key={field.id}
          action={field}
          index={i}
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
          typeOptions={typeOptions}
          folders={folders}
          foldersLoading={foldersLoading}
        />
      ))}
    </RuleSteps>
  );
}

function ActionCard({
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
  // Watch the action type from the form to ensure reactivity
  const actionType = watch(`actions.${index}.type`);
  const fields = actionInputs[actionType].fields;
  const [expandedFields, setExpandedFields] = useState(false);

  // Get expandable fields that should be visible regardless of expanded state
  const hasExpandableFields = fields.some((field) => field.expandable);

  // Precompute content setManually state
  const contentSetManually =
    actionType === ActionType.DRAFT_EMAIL
      ? !!watch(`actions.${index}.content.setManually`)
      : false;

  const actionCanBeDelayed = useMemo(
    () => canActionBeDelayed(actionType),
    [actionType],
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
    if (field.name === "content" && actionType === ActionType.DRAFT_EMAIL) {
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

    // For draft email content, only show variables if set manually
    if (field.name === "content" && actionType === ActionType.DRAFT_EMAIL) {
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
          </FormItem>
        );
      }}
    />
  );

  const isEmailAction =
    actionType === ActionType.DRAFT_EMAIL ||
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
            actionType === ActionType.DRAFT_EMAIL &&
            !setManually ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 border rounded">
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

              {field.name === "content" &&
                actionType === ActionType.DRAFT_EMAIL &&
                setManually && (
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => {
                      setValue(`actions.${index}.content.setManually`, false);
                    }}
                  >
                    Auto draft
                  </Button>
                )}
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
      {nonExpandableFields.map((field) => renderField(field))}
      {hasExpandableFields && expandableFields.length > 0 && (
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
          {expandableFields.map((field) => renderField(field))}
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

  const rightContent = (
    <>
      {isEmailAction || actionType === ActionType.CALL_WEBHOOK ? (
        <Card className="p-4 space-y-4">
          {fieldsContent}
          {shouldShowProTip && <VariableProTip />}
          {delayControls}
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

  const isLabelAction = actionType === ActionType.LABEL;
  const labelIdValue = watch(`actions.${index}.labelId`);
  const isPromptMode = !!labelIdValue?.ai;

  return (
    <RuleStep
      onRemove={() => remove(index)}
      removeAriaLabel="Remove action"
      leftContent={leftContent}
      rightContent={rightContent}
      onAddDelay={actionCanBeDelayed ? handleAddDelay : undefined}
      onRemoveDelay={actionCanBeDelayed ? handleRemoveDelay : undefined}
      hasDelay={delayEnabled}
      onUsePrompt={isLabelAction ? handleUsePrompt : undefined}
      onUseLabel={isLabelAction ? handleUseLabel : undefined}
      isPromptMode={isPromptMode}
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
