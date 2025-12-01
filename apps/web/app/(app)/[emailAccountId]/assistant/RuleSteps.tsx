import type {
  Control,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import type { FieldError, FieldErrors } from "react-hook-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType, type CoreConditionType } from "@/utils/config";
import { getEmptyCondition } from "@/utils/condition";
import { getRuleConfig } from "@/utils/rule/consts";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { RuleStep } from "@/app/(app)/[emailAccountId]/assistant/RuleStep";
import type { SystemType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";

const getFilterTooltipText = (filterType: "from" | "to") =>
  `Only apply this rule ${filterType} emails from this address. Supports multiple addresses separated by comma, pipe, or OR. e.g. "@company.com", "hello@example.com OR support@test.com"`;

export function RuleSteps({
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
}) {
  return (
    <Card className="p-4">
      {conditionFields.map((condition, index) => (
        <div key={condition.id}>
          {index > 0 && (
            <div className="flex items-center justify-center py-3">
              <div className="flex items-center gap-3">
                <div className="h-px w-12 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80"
                  onClick={() => {
                    const newOperator =
                      conditionalOperator === LogicalOperator.OR
                        ? LogicalOperator.AND
                        : LogicalOperator.OR;
                    setValue("conditionalOperator", newOperator);
                  }}
                >
                  {conditionalOperator === LogicalOperator.OR ? "OR" : "AND"}
                </Button>
                <div className="h-px w-12 bg-border" />
              </div>
            </div>
          )}
          <RuleStep
            stepNumber={index + 1}
            onRemove={() => removeCondition(index)}
            removeAriaLabel="Remove condition"
            leftContent={
              <FormField
                control={control}
                name={`conditions.${index}.type`}
                render={({ field }) => {
                  const conditionTypeLabel =
                    field.value === ConditionType.AI
                      ? "AI"
                      : field.value === ConditionType.STATIC
                        ? "Static"
                        : field.value;
                  return (
                    <FormItem>
                      <Select
                        onValueChange={(value) => {
                          const selectedType = value;

                          // check if we have duplicate condition types
                          const prospectiveTypes = new Set(
                            conditions.map((c, idx) =>
                              idx === index ? selectedType : c.type,
                            ),
                          );

                          if (prospectiveTypes.size !== conditions.length) {
                            toastError({
                              description:
                                "You can only have one condition of each type.",
                            });
                            return; // abort update
                          }

                          const emptyCondition = getEmptyCondition(
                            selectedType as CoreConditionType,
                          );
                          if (emptyCondition) {
                            setValue(`conditions.${index}`, emptyCondition);
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-[180px]">
                            {field.value ? (
                              <Badge variant="secondary">
                                {conditionTypeLabel}
                              </Badge>
                            ) : (
                              <SelectValue placeholder="Select trigger" />
                            )}
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[
                            { label: "AI", value: ConditionType.AI },
                            {
                              label: "Static",
                              value: ConditionType.STATIC,
                            },
                          ].map((option) => (
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
            }
            rightContent={
              <>
                {watch(`conditions.${index}.type`) === ConditionType.AI &&
                  (ruleSystemType &&
                  isConversationStatusType(ruleSystemType) ? (
                    <div>
                      <Label name="instructions" label="Instructions" />
                      <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                        <p>{getRuleConfig(ruleSystemType).instructions}</p>
                        <p className="mt-2 text-xs italic">
                          Note: Instructions for conversation tracking rules
                          cannot be edited.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <Input
                        type="text"
                        autosizeTextarea
                        rows={3}
                        name={`conditions.${index}.instructions`}
                        label="Instructions"
                        registerProps={register(
                          `conditions.${index}.instructions`,
                        )}
                        error={
                          (
                            errors.conditions?.[index] as {
                              instructions?: FieldError;
                            }
                          )?.instructions
                        }
                        placeholder="e.g. Newsletters, regular content from publications, blogs, or services I've subscribed to"
                        tooltipText="The instructions that will be passed to the AI."
                      />
                    </div>
                  ))}

                {watch(`conditions.${index}.type`) === ConditionType.STATIC && (
                  <>
                    <Input
                      type="text"
                      name={`conditions.${index}.from`}
                      label="From"
                      registerProps={register(`conditions.${index}.from`)}
                      error={
                        (
                          errors.conditions?.[index] as {
                            from?: FieldError;
                          }
                        )?.from
                      }
                      tooltipText={getFilterTooltipText("from")}
                    />
                    <Input
                      type="text"
                      name={`conditions.${index}.to`}
                      label="To"
                      registerProps={register(`conditions.${index}.to`)}
                      error={
                        (
                          errors.conditions?.[index] as {
                            to?: FieldError;
                          }
                        )?.to
                      }
                      tooltipText={getFilterTooltipText("to")}
                    />
                    <Input
                      type="text"
                      name={`conditions.${index}.subject`}
                      label="Subject"
                      registerProps={register(`conditions.${index}.subject`)}
                      error={
                        (
                          errors.conditions?.[index] as {
                            subject?: FieldError;
                          }
                        )?.subject
                      }
                      tooltipText="Only apply this rule to emails with this subject. e.g. Receipt for your purchase"
                    />
                  </>
                )}
              </>
            }
          />
        </div>
      ))}
    </Card>
  );
}
