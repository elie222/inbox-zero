import type {
  Control,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import type { FieldError, FieldErrors } from "react-hook-form";
import { useEffect } from "react";
import { Input, Label, ErrorMessage } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";
import { getRuleConfig } from "@/utils/rule/consts";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import type {
  CreateRuleBody,
  ZodCondition,
} from "@/utils/actions/rule.validation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { RuleStep } from "@/app/(app)/[emailAccountId]/assistant/RuleStep";
import { SystemType } from "@/generated/prisma/enums";
import TextareaAutosize from "react-textarea-autosize";
import { RuleSteps } from "@/app/(app)/[emailAccountId]/assistant/RuleSteps";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { Notice } from "@/components/Notice";

// UI-level condition types
type UIConditionType = "from" | "to" | "subject" | "prompt";

const CONDITION_TYPE_OPTIONS: { label: string; value: UIConditionType }[] = [
  { label: "AI Prompt", value: "prompt" },
  { label: "From", value: "from" },
  { label: "To", value: "to" },
  { label: "Subject", value: "subject" },
];
const MAX_CONDITIONS = CONDITION_TYPE_OPTIONS.length;

// Convert backend condition to UI type
function getUIConditionType(
  condition: ZodCondition,
): UIConditionType | undefined {
  if (condition.type === ConditionType.AI) {
    return "prompt";
  }
  // For STATIC conditions, determine which field is populated
  // With the new structure, each STATIC condition should only have one field
  // We set the active field to "" (empty string) and others to null
  // So we check which field is not null to determine the UI type
  if (condition.from !== null) return "from";
  if (condition.to !== null) return "to";
  if (condition.subject !== null) return "subject";
  if (condition.body !== null) return "subject"; // body maps to subject in UI
  // Return undefined if no field is populated (new/unselected condition)
  return undefined;
}

function allowMultipleConditions(systemType: SystemType | null | undefined) {
  return (
    systemType !== SystemType.COLD_EMAIL &&
    !isConversationStatusType(systemType)
  );
}

// Convert UI type to backend condition
function getConditionFromUIType(
  uiType: UIConditionType | undefined,
): ZodCondition | never {
  if (!uiType) {
    // Create empty condition with no field selected
    return {
      type: ConditionType.STATIC,
      from: null,
      to: null,
      subject: null,
      body: null,
      instructions: null,
    };
  }
  if (uiType === "prompt") {
    return {
      type: ConditionType.AI,
      instructions: "",
      from: null,
      to: null,
      subject: null,
      body: null,
    };
  }
  if (uiType === "from") {
    return {
      type: ConditionType.STATIC,
      from: "",
      to: null,
      subject: null,
      body: null,
      instructions: null,
    };
  }
  if (uiType === "to") {
    return {
      type: ConditionType.STATIC,
      from: null,
      to: "",
      subject: null,
      body: null,
      instructions: null,
    };
  }
  if (uiType === "subject") {
    return {
      type: ConditionType.STATIC,
      from: null,
      to: null,
      subject: "",
      body: null,
      instructions: null,
    };
  }
  // This should never happen, but TypeScript needs it
  throw new Error(`Unknown UI condition type: ${uiType}`);
}

export function ConditionSteps({
  conditionFields,
  conditionalOperator,
  removeCondition,
  control,
  watch,
  setValue,
  register,
  errors,
  conditions,
  ruleSystemType,
  appendCondition,
}: {
  conditionFields: Array<{ id: string }>;
  conditionalOperator: LogicalOperator | null | undefined;
  removeCondition: (index: number) => void;
  control: Control<CreateRuleBody>;
  watch: UseFormWatch<CreateRuleBody>;
  setValue: UseFormSetValue<CreateRuleBody>;
  register: UseFormRegister<CreateRuleBody>;
  errors: FieldErrors<CreateRuleBody>;
  conditions: CreateRuleBody["conditions"];
  ruleSystemType: SystemType | null | undefined;
  appendCondition: (condition: ZodCondition) => void;
}) {
  // Check if we can add more conditions
  // Max 4 conditions possible (prompt, from, to, subject)
  const maxConditionsReached = conditions.length >= MAX_CONDITIONS;

  const canAddMoreConditions =
    !(ruleSystemType && isConversationStatusType(ruleSystemType)) &&
    allowMultipleConditions(ruleSystemType) &&
    !maxConditionsReached;

  // Set first condition to prompt type only if it's empty/unconfigured
  // This preserves existing static conditions when loading a rule
  useEffect(() => {
    if (conditions.length > 0) {
      const firstCondition = conditions[0];
      const uiType = getUIConditionType(firstCondition);
      // Only set to prompt if the condition is empty (undefined type)
      // Don't replace existing static conditions (from/to/subject)
      if (uiType === undefined) {
        const promptCondition = getConditionFromUIType("prompt");
        setValue("conditions.0", promptCondition);
      }
    }
  }, [conditions, setValue]);

  return (
    <RuleSteps
      onAdd={() => {
        // Create empty condition with no default selection
        const newCondition = getConditionFromUIType(undefined);
        appendCondition(newCondition);
      }}
      addButtonLabel="Add Condition"
      addButtonDisabled={!canAddMoreConditions}
      addButtonTooltip={
        maxConditionsReached
          ? "Maximum number of conditions reached."
          : !canAddMoreConditions
            ? "You can only set one condition for this rule."
            : undefined
      }
    >
      {conditionFields.map((condition, index) => {
        const currentCondition = watch(`conditions.${index}`);
        const uiType = getUIConditionType(currentCondition);
        const isFirstCondition = index === 0;
        const isFirstConditionPrompt = isFirstCondition && uiType === "prompt";

        // Hide leftContent only for first condition when it's a prompt type
        // Static conditions always need the label shown
        const leftContent = isFirstConditionPrompt ? null : (
          <FormField
            control={control}
            name={`conditions.${index}`}
            render={({ field }) => {
              const currentCondition = field.value;
              const uiType = getUIConditionType(currentCondition);

              const conditionTypeLabel =
                uiType === "prompt"
                  ? "AI Prompt"
                  : uiType === "from"
                    ? "From"
                    : uiType === "to"
                      ? "To"
                      : uiType === "subject"
                        ? "Subject"
                        : "Select";

              // Get UI types already used in other conditions (excluding current)
              const usedUITypes = new Set(
                conditions
                  .map((c, idx) =>
                    idx === index ? undefined : getUIConditionType(c),
                  )
                  .filter(
                    (type): type is UIConditionType =>
                      type !== undefined && type !== null,
                  ),
              );

              // Determine operator display logic:
              // - AND/OR selector only between AI condition and first static condition
              // - Static conditions always show "and" between each other
              const previousConditionType =
                index > 0
                  ? getUIConditionType(conditions[index - 1])
                  : undefined;

              // Static following static: both current and previous are not prompt
              // (includes undefined/empty conditions as they will become static)
              const isStaticFollowingStatic =
                uiType !== "prompt" && previousConditionType !== "prompt";

              // Show AND/OR selector only at boundary between AI (prompt) and static conditions
              const showOperatorSelector =
                index === 1 && previousConditionType === "prompt";

              return (
                <FormItem>
                  <Select
                    onValueChange={(value: UIConditionType) => {
                      // Check if we have duplicate UI condition types
                      const prospectiveUITypes = conditions.map((c, idx) =>
                        idx === index ? value : getUIConditionType(c),
                      );
                      const configuredTypes = prospectiveUITypes.filter(
                        (type): type is UIConditionType =>
                          type !== undefined && type !== null,
                      );
                      const uniqueUITypes = new Set(configuredTypes);

                      if (uniqueUITypes.size !== configuredTypes.length) {
                        toastError({
                          description:
                            "You can only have one condition of each type.",
                        });
                        return; // abort update
                      }

                      const newCondition = getConditionFromUIType(value);

                      // If AI Prompt is selected at a non-first position,
                      // insert it at position 0 and shift other conditions
                      if (value === "prompt" && index !== 0) {
                        const currentConditionAtIndex = conditions[index];
                        const currentConditionType = getUIConditionType(
                          currentConditionAtIndex,
                        );

                        // Build new conditions array with AI Prompt at position 0
                        const newConditions = [newCondition];

                        // Add all existing conditions except the one being changed
                        for (let i = 0; i < conditions.length; i++) {
                          if (i !== index) {
                            newConditions.push(conditions[i]);
                          } else if (currentConditionType !== undefined) {
                            // If the condition being changed had data, keep it
                            newConditions.push(currentConditionAtIndex);
                          }
                          // If it was empty (undefined type), just skip it
                        }

                        setValue("conditions", newConditions);
                      } else {
                        setValue(`conditions.${index}`, newCondition);
                      }
                    }}
                    value={uiType || undefined}
                  >
                    <div className="flex items-center gap-2">
                      {index === 0 ? null : showOperatorSelector ? (
                        <Select
                          value={
                            conditionalOperator === LogicalOperator.OR
                              ? "or"
                              : "and"
                          }
                          onValueChange={(value) => {
                            setValue(
                              "conditionalOperator",
                              value === "or"
                                ? LogicalOperator.OR
                                : LogicalOperator.AND,
                            );
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="w-[80px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="and">and</SelectItem>
                            <SelectItem value="or">or</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-muted-foreground">
                          {isStaticFollowingStatic
                            ? "and"
                            : conditionalOperator === LogicalOperator.OR
                              ? "or"
                              : "and"}
                        </p>
                      )}
                      <FormControl>
                        <SelectTrigger className="w-[120px]">
                          {uiType ? (
                            conditionTypeLabel
                          ) : (
                            <SelectValue placeholder="Choose" />
                          )}
                        </SelectTrigger>
                      </FormControl>
                    </div>
                    <SelectContent>
                      {CONDITION_TYPE_OPTIONS.filter(
                        (option) =>
                          !usedUITypes.has(option.value) ||
                          option.value === uiType,
                      ).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              );
            }}
          />
        );

        // Check if this static condition should be indented
        // Only indent static conditions that follow another static condition (the AND'd group)
        // The first static after AI prompt should NOT be indented (it shows the and/or boundary)
        const firstConditionIsPrompt =
          getUIConditionType(conditions[0]) === "prompt";
        const isStaticOrEmpty = uiType !== "prompt";
        const isSecondOrLaterStaticAfterPrompt =
          firstConditionIsPrompt && isStaticOrEmpty && index > 1;
        const shouldIndent = isSecondOrLaterStaticAfterPrompt;

        return (
          <div
            className={`pl-3 ${shouldIndent ? "ml-14" : ""}`}
            key={condition.id}
          >
            <RuleStep
              onRemove={() => removeCondition(index)}
              removeAriaLabel="Remove condition"
              leftContent={leftContent}
              rightContent={(() => {
                const currentCondition = watch(`conditions.${index}`);
                const uiType = getUIConditionType(currentCondition);

                if (uiType === "prompt") {
                  const isDisabled =
                    ruleSystemType && isConversationStatusType(ruleSystemType);

                  return (
                    <>
                      {isFirstCondition && (
                        <div className="mb-2">
                          <Label
                            name={`conditions.${index}.instructions`}
                            label="Matching:"
                          />
                        </div>
                      )}
                      <div className="relative">
                        <TextareaAutosize
                          className="block w-full flex-1 whitespace-pre-wrap rounded-md border border-border bg-background shadow-sm focus:border-black focus:ring-black sm:text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          minRows={3}
                          rows={3}
                          {...(isDisabled
                            ? {
                                value:
                                  getRuleConfig(ruleSystemType).instructions,
                                disabled: true,
                              }
                            : {
                                ...register(`conditions.${index}.instructions`),
                                placeholder:
                                  "e.g. Newsletters, regular content from publications, blogs, or services I've subscribed to",
                              })}
                        />
                      </div>
                      {isDisabled && (
                        <div className="mt-3">
                          <Notice variant="warning">
                            This rule uses preset instructions that cannot be
                            modified.
                          </Notice>
                        </div>
                      )}
                      {!isDisabled &&
                        (
                          errors.conditions?.[index] as {
                            instructions?: FieldError;
                          }
                        )?.instructions && (
                          <div className="mt-2">
                            <ErrorMessage
                              message={
                                (
                                  errors.conditions?.[index] as {
                                    instructions?: FieldError;
                                  }
                                )?.instructions?.message || "Invalid value"
                              }
                            />
                          </div>
                        )}
                    </>
                  );
                }

                if (uiType === "from") {
                  return (
                    <div className="relative">
                      <Input
                        type="text"
                        name={`conditions.${index}.from`}
                        registerProps={register(`conditions.${index}.from`)}
                        placeholder="hello@example.com OR support@test.com"
                        className="pr-8"
                        error={
                          (
                            errors.conditions?.[index] as {
                              from?: FieldError;
                            }
                          )?.from
                        }
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <TooltipExplanation
                          text={getFilterTooltipText("from")}
                          side="right"
                          size="sm"
                          className="text-gray-400"
                        />
                      </div>
                    </div>
                  );
                }

                if (uiType === "to") {
                  return (
                    <div className="relative">
                      <Input
                        type="text"
                        name={`conditions.${index}.to`}
                        registerProps={register(`conditions.${index}.to`)}
                        placeholder="hello@example.com OR support@test.com"
                        className="pr-8"
                        error={
                          (
                            errors.conditions?.[index] as {
                              to?: FieldError;
                            }
                          )?.to
                        }
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <TooltipExplanation
                          text={getFilterTooltipText("to")}
                          side="right"
                          size="sm"
                          className="text-gray-400"
                        />
                      </div>
                    </div>
                  );
                }

                if (uiType === "subject") {
                  return (
                    <div className="relative">
                      <Input
                        type="text"
                        name={`conditions.${index}.subject`}
                        registerProps={register(`conditions.${index}.subject`)}
                        placeholder="Receipt for your purchase"
                        className="pr-8"
                        error={
                          (
                            errors.conditions?.[index] as {
                              subject?: FieldError;
                            }
                          )?.subject
                        }
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <TooltipExplanation
                          text="Only apply this rule to emails with this subject. e.g. Receipt for your purchase"
                          side="right"
                          size="sm"
                          className="text-gray-400"
                        />
                      </div>
                    </div>
                  );
                }

                return null;
              })()}
            />
          </div>
        );
      })}
    </RuleSteps>
  );
}

const getFilterTooltipText = (filterType: "from" | "to") =>
  `Only apply this rule ${filterType} emails from this address. Supports multiple addresses separated by comma, pipe, or OR. e.g. "@company.com", "hello@example.com OR support@test.com"`;
