"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  type FieldError,
  type SubmitHandler,
  useFieldArray,
  useForm,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import TextareaAutosize from "react-textarea-autosize";
import { capitalCase } from "capital-case";
import { usePostHog } from "posthog-js/react";
import {
  ExternalLinkIcon,
  PlusIcon,
  FilterIcon,
  BrainIcon,
} from "lucide-react";
import { CardBasic } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorMessage, Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import {
  ActionType,
  CategoryFilterType,
  LogicalOperator,
  SystemType,
} from "@prisma/client";
import { ConditionType, type CoreConditionType } from "@/utils/config";
import { createRuleAction, updateRuleAction } from "@/utils/actions/rule";
import {
  type CreateRuleBody,
  createRuleBody,
} from "@/utils/actions/rule.validation";
import { actionInputs } from "@/utils/action-item";
import { Select } from "@/components/Select";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { Combobox } from "@/components/Combobox";
import { useLabels } from "@/hooks/useLabels";
import { createLabelAction } from "@/utils/actions/mail";
import type { LabelsResponse } from "@/app/api/google/labels/route";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { useCategories } from "@/hooks/useCategories";
import { hasVariables } from "@/utils/template";
import { getEmptyCondition } from "@/utils/condition";
import { AlertError } from "@/components/Alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LearnedPatterns } from "@/app/(app)/[emailAccountId]/automation/group/LearnedPatterns";
import { Tooltip } from "@/components/Tooltip";
import { createGroupAction } from "@/utils/actions/group";
import { NEEDS_REPLY_LABEL_NAME } from "@/utils/reply-tracker/consts";
import { Badge } from "@/components/Badge";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { useRule } from "@/hooks/useRule";

export function Rule({ ruleId }: { ruleId: string }) {
  const { data, isLoading, error } = useRule(ruleId);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && <RuleForm rule={data.rule} />}
    </LoadingContent>
  );
}

export function RuleForm({ rule }: { rule: CreateRuleBody & { id?: string } }) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting, isSubmitted },
    trigger,
  } = useForm<CreateRuleBody>({
    resolver: zodResolver(createRuleBody),
    defaultValues: rule
      ? {
          ...rule,
          actions: [
            ...rule.actions.map((action) => ({
              ...action,
              content: {
                ...action.content,
                setManually: !!action.content?.value,
              },
            })),
          ],
        }
      : undefined,
  });

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition,
  } = useFieldArray({
    control,
    name: "conditions",
  });
  const { append, remove } = useFieldArray({ control, name: "actions" });

  const { userLabels, isLoading, mutate } = useLabels();
  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();
  const router = useRouter();

  const posthog = usePostHog();

  const onSubmit: SubmitHandler<CreateRuleBody> = useCallback(
    async (data) => {
      // create labels that don't exist
      for (const action of data.actions) {
        if (action.type === ActionType.LABEL) {
          const hasLabel = userLabels?.some(
            (label) => label.name === action.label,
          );
          if (!hasLabel && action.label?.value && !action.label?.ai) {
            await createLabelAction(emailAccountId, {
              name: action.label.value,
            });
          }
        }
      }

      // set content to empty string if it's not set manually
      for (const action of data.actions) {
        if (action.type === ActionType.DRAFT_EMAIL) {
          if (!action.content?.setManually) {
            action.content = { value: "", ai: false };
          }
        }
      }

      if (data.id) {
        const res = await updateRuleAction(emailAccountId, {
          ...data,
          id: data.id,
        });

        if (res?.serverError) {
          console.error(res);
          toastError({ description: res.serverError });
        } else if (!res?.data?.rule) {
          toastError({
            description: "There was an error updating the rule.",
          });
        } else {
          toastSuccess({ description: "Saved!" });
          posthog.capture("User updated AI rule", {
            conditions: data.conditions.map((condition) => condition.type),
            actions: data.actions.map((action) => action.type),
            automate: data.automate,
            runOnThreads: data.runOnThreads,
          });
          router.push(prefixPath(emailAccountId, "/automation?tab=rules"));
        }
      } else {
        const res = await createRuleAction(emailAccountId, data);

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
            actions: data.actions.map((action) => action.type),
            automate: data.automate,
            runOnThreads: data.runOnThreads,
          });
          router.replace(
            prefixPath(emailAccountId, `/automation/rule/${res.data.rule.id}`),
          );
          router.push(prefixPath(emailAccountId, "/automation?tab=rules"));
        }
      }
    },
    [userLabels, router, posthog, emailAccountId],
  );

  const conditions = watch("conditions");
  const unusedCondition = useMemo(() => {
    const usedConditions = new Set(conditions?.map(({ type }) => type));
    return [
      ConditionType.AI,
      ConditionType.STATIC,
      ConditionType.CATEGORY,
    ].find((type) => !usedConditions.has(type)) as
      | CoreConditionType
      | undefined;
  }, [conditions]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    trigger("conditions");
  }, [conditions]);

  const actionErrors = useMemo(() => {
    const actionErrors: string[] = [];
    watch("actions")?.forEach((_, index) => {
      const actionError =
        errors?.actions?.[index]?.url?.root?.message ||
        errors?.actions?.[index]?.label?.root?.message ||
        errors?.actions?.[index]?.to?.root?.message;
      if (actionError) actionErrors.push(actionError);
    });
    return actionErrors;
  }, [errors, watch]);

  const conditionalOperator = watch("conditionalOperator");

  const typeOptions = useMemo(() => {
    return [
      { label: "Archive", value: ActionType.ARCHIVE },
      { label: "Label", value: ActionType.LABEL },
      { label: "Draft reply", value: ActionType.DRAFT_EMAIL },
      { label: "Reply", value: ActionType.REPLY },
      { label: "Send email", value: ActionType.SEND_EMAIL },
      { label: "Forward", value: ActionType.FORWARD },
      { label: "Mark read", value: ActionType.MARK_READ },
      { label: "Mark spam", value: ActionType.MARK_SPAM },
      { label: "Call webhook", value: ActionType.CALL_WEBHOOK },
      { label: "Track reply", value: ActionType.TRACK_THREAD },
    ];
  }, []);

  const [learnedPatternGroupId, setLearnedPatternGroupId] = useState(
    rule.groupId,
  );

  return (
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
        <Input
          type="text"
          name="Name"
          label="Rule name"
          registerProps={register("name")}
          error={errors.name}
          placeholder="e.g. Label receipts"
        />
      </div>

      {showSystemTypeBadge(rule.systemType) && (
        <div className="mt-2 flex items-center gap-2">
          <Badge color="green">
            This rule has special preset logic that may impact your conditions
          </Badge>
        </div>
      )}

      <div className="mt-6 flex items-end justify-between">
        <TypographyH3>Conditions</TypographyH3>

        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FilterIcon className="mr-2 h-4 w-4" />
                Match{" "}
                {!conditionalOperator ||
                conditionalOperator === LogicalOperator.AND
                  ? "all"
                  : "any"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={conditionalOperator}
                onValueChange={(value) =>
                  setValue("conditionalOperator", value as LogicalOperator)
                }
              >
                <DropdownMenuRadioItem value={LogicalOperator.AND}>
                  Match all conditions
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value={LogicalOperator.OR}>
                  Match any condition
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {!learnedPatternGroupId && !!rule.id && (
            <Tooltip content="Show learned patterns">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={async () => {
                  if (!rule.id) return;

                  const result = await createGroupAction(emailAccountId, {
                    ruleId: rule.id,
                  });

                  if (result?.serverError) {
                    toastError({ description: result.serverError });
                  } else if (!result?.data?.groupId) {
                    toastError({
                      description:
                        "There was an error setting up learned patterns.",
                    });
                  } else {
                    setLearnedPatternGroupId(result.data.groupId);
                  }
                }}
              >
                <BrainIcon className="size-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {errors.conditions?.root?.message && (
        <div className="mt-4">
          <AlertError
            title="Error"
            description={errors.conditions.root.message}
          />
        </div>
      )}

      <div className="mt-4 space-y-4">
        {conditionFields.map((condition, index) => (
          <CardBasic key={condition.id} className="mt-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="sm:col-span-1">
                <Select
                  label="Type"
                  options={[
                    { label: "AI", value: ConditionType.AI },
                    { label: "Static", value: ConditionType.STATIC },
                    { label: "Sender Category", value: ConditionType.CATEGORY },
                  ]}
                  error={
                    errors.conditions?.[index]?.type as FieldError | undefined
                  }
                  {...register(`conditions.${index}.type`, {
                    onChange: (e) => {
                      const selectedType = e.target.value;

                      // check if we have duplicate condition types
                      const conditionTypes = new Set(
                        conditions.map((condition) => condition.type),
                      );

                      if (conditionTypes.size !== conditions.length) {
                        toastError({
                          description:
                            "You can only have one condition of each type.",
                        });
                      }

                      const emptyCondition = getEmptyCondition(selectedType);
                      if (emptyCondition) {
                        setValue(`conditions.${index}`, emptyCondition);
                      }
                    },
                  })}
                />
              </div>

              <div className="space-y-4 sm:col-span-3">
                {watch(`conditions.${index}.type`) === ConditionType.AI && (
                  <Input
                    type="text"
                    autosizeTextarea
                    rows={3}
                    name={`conditions.${index}.instructions`}
                    label="Instructions"
                    registerProps={register(`conditions.${index}.instructions`)}
                    error={
                      (
                        errors.conditions?.[index] as {
                          instructions?: FieldError;
                        }
                      )?.instructions
                    }
                    placeholder='e.g. Apply this rule to all "receipts"'
                    tooltipText="The instructions that will be passed to the AI."
                  />
                )}

                {watch(`conditions.${index}.type`) === ConditionType.STATIC && (
                  <>
                    <Input
                      type="text"
                      name={`conditions.${index}.from`}
                      label="From"
                      registerProps={register(`conditions.${index}.from`)}
                      error={
                        (errors.conditions?.[index] as { from?: FieldError })
                          ?.from
                      }
                      placeholder="e.g. hello@company.com"
                      tooltipText="Only apply this rule to emails from this address."
                    />
                    <Input
                      type="text"
                      name={`conditions.${index}.to`}
                      label="To"
                      registerProps={register(`conditions.${index}.to`)}
                      error={
                        (errors.conditions?.[index] as { to?: FieldError })?.to
                      }
                      placeholder="e.g. hello@company.com"
                      tooltipText="Only apply this rule to emails sent to this address."
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
                      placeholder="e.g. Receipt for your purchase"
                      tooltipText="Only apply this rule to emails with this subject."
                    />
                  </>
                )}

                {watch(`conditions.${index}.type`) ===
                  ConditionType.CATEGORY && (
                  <>
                    <div className="flex items-center gap-4">
                      <RadioGroup
                        defaultValue={CategoryFilterType.INCLUDE}
                        value={
                          watch(`conditions.${index}.categoryFilterType`) ||
                          undefined
                        }
                        onValueChange={(value) =>
                          setValue(
                            `conditions.${index}.categoryFilterType`,
                            value as CategoryFilterType,
                          )
                        }
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value={CategoryFilterType.INCLUDE}
                            id="include"
                          />
                          <Label name="include" label="Match" />
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value={CategoryFilterType.EXCLUDE}
                            id="exclude"
                          />
                          <Label name="exclude" label="Skip" />
                        </div>
                      </RadioGroup>

                      <TooltipExplanation text="This stops the AI from applying this rule to emails that don't match your criteria." />
                    </div>

                    <LoadingContent
                      loading={categoriesLoading}
                      error={categoriesError}
                    >
                      {categories.length ? (
                        <>
                          <MultiSelectFilter
                            title="Categories"
                            maxDisplayedValues={8}
                            options={categories.map((category) => ({
                              label: capitalCase(category.name),
                              value: category.id,
                            }))}
                            selectedValues={
                              new Set(
                                watch(`conditions.${index}.categoryFilters`),
                              )
                            }
                            setSelectedValues={(selectedValues) => {
                              setValue(
                                `conditions.${index}.categoryFilters`,
                                Array.from(selectedValues),
                              );
                            }}
                          />
                          {(
                            errors.conditions?.[index] as {
                              categoryFilters?: { message?: string };
                            }
                          )?.categoryFilters?.message && (
                            <ErrorMessage
                              message={
                                (
                                  errors.conditions?.[index] as {
                                    categoryFilters?: { message?: string };
                                  }
                                )?.categoryFilters?.message || ""
                              }
                            />
                          )}

                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="ml-2"
                          >
                            <Link
                              href={prefixPath(
                                emailAccountId,
                                "/smart-categories/setup",
                              )}
                              target="_blank"
                            >
                              Create category
                              <ExternalLinkIcon className="ml-1.5 size-4" />
                            </Link>
                          </Button>
                        </>
                      ) : (
                        <div>
                          <SectionDescription>
                            No sender categories found.
                          </SectionDescription>

                          <Button asChild className="mt-1">
                            <Link
                              href={prefixPath(
                                emailAccountId,
                                "/smart-categories",
                              )}
                              target="_blank"
                            >
                              Set up Sender Categories
                              <ExternalLinkIcon className="ml-1.5 size-4" />
                            </Link>
                          </Button>
                        </div>
                      )}
                    </LoadingContent>
                  </>
                )}
              </div>
            </div>

            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="mt-2"
              onClick={() => removeCondition(index)}
            >
              Remove
            </Button>
          </CardBasic>
        ))}
      </div>

      {unusedCondition && (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => appendCondition(getEmptyCondition(unusedCondition))}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Condition
          </Button>
        </div>
      )}

      {learnedPatternGroupId && (
        <div className="mt-4">
          <LearnedPatterns groupId={learnedPatternGroupId} />
        </div>
      )}

      <TypographyH3 className="mt-6">Actions</TypographyH3>

      {actionErrors.length > 0 && (
        <div className="mt-4">
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
        </div>
      )}

      <div className="mt-4 space-y-4">
        {watch("actions")?.map((action, i) => {
          const fields = actionInputs[action.type].fields;

          return (
            <CardBasic key={i}>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="sm:col-span-1">
                  <Select
                    label="Type"
                    options={typeOptions}
                    {...register(`actions.${i}.type`)}
                    error={errors.actions?.[i]?.type as FieldError | undefined}
                  />

                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => remove(i)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="space-y-4 sm:col-span-3">
                  {fields.map((field) => {
                    const isAiGenerated = !!action[field.name]?.ai;

                    const value =
                      watch(`actions.${i}.${field.name}.value`) || "";
                    const setManually = !!watch(
                      `actions.${i}.${field.name}.setManually`,
                    );

                    return (
                      <ActionField
                        key={field.label}
                        field={field}
                        action={action}
                        index={i}
                        isAiGenerated={isAiGenerated}
                        value={value}
                        setManually={setManually}
                        register={register}
                        setValue={setValue}
                        errors={errors}
                        userLabels={userLabels}
                        isLoading={isLoading}
                        mutate={mutate}
                        emailAccountId={emailAccountId}
                      />
                    );
                  })}

                  {action.type === ActionType.TRACK_THREAD && (
                    <ReplyTrackerAction />
                  )}
                </div>
              </div>
            </CardBasic>
          );
        })}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => append({ type: ActionType.LABEL })}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Action
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-end space-x-2">
        <TooltipExplanation
          size="md"
          text="When enabled our AI will perform actions automatically. If disabled, you will have to confirm actions first."
        />

        <Toggle
          name="automate"
          label="Automate"
          enabled={watch("automate") || false}
          onChange={(enabled) => {
            setValue("automate", enabled);
          }}
        />
      </div>

      <div className="mt-4 flex items-center justify-end space-x-2">
        <ThreadsExplanation size="md" />

        <Toggle
          name="runOnThreads"
          label="Apply to threads"
          enabled={watch("runOnThreads") || false}
          onChange={(enabled) => {
            setValue("runOnThreads", enabled);
          }}
        />
      </div>

      <div className="flex justify-end space-x-2 py-6">
        {rule.id ? (
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Save
          </Button>
        ) : (
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Create
          </Button>
        )}
      </div>
    </form>
  );
}

function LabelCombobox({
  value,
  onChangeValue,
  userLabels,
  isLoading,
  mutate,
  emailAccountId,
}: {
  value: string;
  onChangeValue: (value: string) => void;
  userLabels: NonNullable<LabelsResponse["labels"]>;
  isLoading: boolean;
  mutate: () => void;
  emailAccountId: string;
}) {
  const [search, setSearch] = useState("");

  return (
    <Combobox
      options={userLabels.map((label) => ({
        value: label.name || "",
        label: label.name || "",
      }))}
      value={value}
      onChangeValue={onChangeValue}
      search={search}
      onSearch={setSearch}
      placeholder="Select a label"
      emptyText={
        <div>
          <div>No labels</div>
          {search && (
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => {
                toast.promise(
                  async () => {
                    const res = await createLabelAction(emailAccountId, {
                      name: search,
                    });
                    mutate();
                    if (res?.serverError) throw new Error(res.serverError);
                  },
                  {
                    loading: `Creating label "${search}"...`,
                    success: `Created label "${search}"`,
                    error: (errorMessage) =>
                      `Error creating label "${search}": ${errorMessage}`,
                  },
                );
              }}
            >
              {`Create "${search}" label`}
            </Button>
          )}
        </div>
      }
      loading={isLoading}
    />
  );
}

function ReplyTrackerAction() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm text-center text-sm text-muted-foreground">
        Used for reply tracking (Reply Zero). This action tracks emails this
        rule is applied to and removes the{" "}
        <Badge color="green">{NEEDS_REPLY_LABEL_NAME}</Badge> label after you
        reply to the email.
      </div>
    </div>
  );
}

function ActionField({
  field,
  action,
  index: i,
  isAiGenerated,
  value,
  setManually,
  register,
  setValue,
  errors,
  userLabels,
  isLoading,
  mutate,
  emailAccountId,
}: {
  field: {
    name: "label" | "subject" | "content" | "to" | "cc" | "bcc" | "url";
    label: string;
    textArea?: boolean;
  };
  action: CreateRuleBody["actions"][number];
  index: number;
  isAiGenerated: boolean;
  value: string | undefined;
  setManually: boolean;
  register: UseFormRegister<CreateRuleBody>;
  setValue: UseFormSetValue<CreateRuleBody>;
  errors: any; // Unfortunately, we need to use any here for now
  userLabels: NonNullable<LabelsResponse["labels"]>;
  isLoading: boolean;
  mutate: () => void;
  emailAccountId: string;
}) {
  // Get the typed field value safely
  const getFieldValue = (fieldName: string): string => {
    // Type assertion to access the field by name
    const fieldValue = action[fieldName as keyof typeof action];
    if (fieldValue && typeof fieldValue === "object" && "value" in fieldValue) {
      return (fieldValue.value as string) || "";
    }
    return "";
  };

  // Check if this field has an error
  const fieldError = errors?.actions?.[i]?.[field.name]?.message;

  const isDraftContent =
    field.name === "content" && action.type === ActionType.DRAFT_EMAIL;

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label name={field.name} label={field.label} />
        {field.name === "label" && (
          <div className="flex items-center space-x-2">
            <TooltipExplanation text="Enable for AI-generated values unique to each email. Put the prompt inside braces {{your prompt here}}. Disable to use a fixed value." />
            <Toggle
              name={`actions.${i}.${field.name}.ai`}
              label="AI generated"
              enabled={isAiGenerated || false}
              onChange={(enabled: boolean) => {
                setValue(
                  `actions.${i}.${field.name}`,
                  enabled ? { value: "", ai: true } : { value: "", ai: false },
                );
              }}
            />
          </div>
        )}
      </div>

      {field.name === "label" && !isAiGenerated ? (
        <div className="mt-2">
          <LabelCombobox
            userLabels={userLabels}
            isLoading={isLoading}
            mutate={mutate}
            value={getFieldValue(field.name)}
            onChangeValue={(newValue: string) => {
              setValue(`actions.${i}.${field.name}.value`, newValue);
            }}
            emailAccountId={emailAccountId}
          />
        </div>
      ) : isDraftContent && !setManually ? (
        <div className="mt-2 flex h-full flex-col items-center justify-center gap-2 rounded border py-8">
          <div className="max-w-sm text-center text-sm text-muted-foreground">
            Our AI will generate a reply using your knowledge base and previous
            conversations with the sender
          </div>

          <Button
            variant="link"
            size="xs"
            onClick={() => {
              setValue(`actions.${i}.content.setManually`, true);
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
            placeholder="Add text or use {{AI prompts}}. e.g. Hi {{name}}"
            value={value || ""}
            {...register(`actions.${i}.${field.name}.value`)}
          />

          {isDraftContent && setManually && (
            <Button
              variant="link"
              size="xs"
              onClick={() => {
                setValue(`actions.${i}.content.setManually`, false);
              }}
            >
              Auto draft
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <input
            className="block w-full flex-1 rounded-md border border-border bg-background shadow-sm focus:border-black focus:ring-black sm:text-sm"
            type="text"
            placeholder="Add text or use {{AI prompts}}. e.g. Hi {{name}}"
            {...register(`actions.${i}.${field.name}.value`)}
          />
        </div>
      )}

      {hasVariables(value) && (
        <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-sm text-foreground">
          {(value || "").split(/(\{\{.*?\}\})/g).map((part, idx) =>
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

      {fieldError && <ErrorMessage message={fieldError.toString()} />}
    </div>
  );
}

function showSystemTypeBadge(systemType?: SystemType | null): boolean {
  if (systemType === SystemType.TO_REPLY) return true;
  if (systemType === SystemType.CALENDAR) return true;
  return false;
}

export function ThreadsExplanation({ size }: { size: "sm" | "md" }) {
  return (
    <TooltipExplanation
      size={size}
      text="When enabled, this rule can apply to the first email and any subsequent replies in a conversation. When disabled, it can only apply to the first email."
    />
  );
}
