"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  type FieldError,
  type FieldErrors,
  type SubmitHandler,
  type UseFormRegisterReturn,
  type UseFormSetValue,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { capitalCase } from "capital-case";
import { HelpCircleIcon, PlusIcon } from "lucide-react";
import { Card } from "@/components/Card";
import { Button, ButtonLoader } from "@/components/ui/button";
import { ErrorMessage, Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  MessageText,
  SectionDescription,
  TypographyH3,
} from "@/components/Typography";
import { ActionType, RuleType } from "@prisma/client";
import { createRuleAction, updateRuleAction } from "@/utils/actions/rule";
import {
  type CreateRuleBody,
  createRuleBody,
} from "@/utils/actions/validation";
import { actionInputs } from "@/utils/actionType";
import { Select } from "@/components/Select";
import { Toggle } from "@/components/Toggle";
import { Tooltip } from "@/components/Tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useSWR from "swr";
import type { GroupsResponse } from "@/app/api/user/group/route";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { ViewGroupButton } from "@/app/(app)/automation/group/ViewGroup";
import { CreateGroupModalButton } from "@/app/(app)/automation/group/CreateGroupModal";
import { createPredefinedGroupAction } from "@/utils/actions/group";
import {
  NEWSLETTER_GROUP_ID,
  RECEIPT_GROUP_ID,
} from "@/app/(app)/automation/create/examples";
import { isActionError } from "@/utils/error";
import { Combobox } from "@/components/Combobox";
import { useLabels } from "@/hooks/useLabels";
import { createLabelAction } from "@/utils/actions/mail";
import type { LabelsResponse } from "@/app/api/google/labels/route";

export function RuleForm({ rule }: { rule: CreateRuleBody & { id?: string } }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateRuleBody>({
    resolver: zodResolver(createRuleBody),
    defaultValues: rule,
  });

  const { append, remove } = useFieldArray({ control, name: "actions" });

  const { userLabels, data: gmailLabelsData, isLoading, mutate } = useLabels();

  const router = useRouter();

  const onSubmit: SubmitHandler<CreateRuleBody> = useCallback(
    async (data) => {
      const searchParams = new URLSearchParams(window.location.search);
      const tab = searchParams.get("tab") || rule.type;
      const body = cleanRule(data, tab as RuleType);

      // create labels that don't exist
      for (const action of body.actions) {
        if (action.type === ActionType.LABEL) {
          const hasLabel = gmailLabelsData?.labels?.some(
            (label) => label.name === action.label,
          );
          if (!hasLabel && action.label?.value) {
            await createLabelAction({ name: action.label.value });
          }
        }
      }

      if (body.id) {
        const res = await updateRuleAction({ ...body, id: body.id });

        if (isActionError(res)) {
          console.error(res);
          toastError({ description: res.error });
        } else if (!res.rule) {
          toastError({
            description: `There was an error updating the rule.`,
          });
        } else {
          toastSuccess({ description: `Saved!` });
          router.push(`/automation`);
        }
      } else {
        const res = await createRuleAction(body);

        if (isActionError(res)) {
          console.error(res);
          toastError({ description: res.error });
        } else if (!res.rule) {
          toastError({
            description: `There was an error creating the rule.`,
          });
        } else {
          toastSuccess({ description: `Created!` });
          router.replace(`/automation/rule/${res.rule.id}`);
          router.push(`/automation`);
        }
      }
    },
    [gmailLabelsData?.labels, rule.type, router],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="mt-4">
        <Input
          type="text"
          name="Name"
          label="Rule name"
          registerProps={register("name")}
          error={errors.name}
          placeholder="eg. Label receipts"
        />
      </div>

      <TypographyH3 className="mt-6">Conditions</TypographyH3>

      <Tabs defaultValue={rule.type} className="mt-2">
        <TabsList>
          <TabsTrigger value={RuleType.AI}>AI</TabsTrigger>
          <TabsTrigger value={RuleType.STATIC}>Static</TabsTrigger>
          <TabsTrigger value={RuleType.GROUP}>Group</TabsTrigger>
        </TabsList>

        <TabsContent value={RuleType.AI}>
          <div className="mt-4 space-y-4">
            <Input
              type="text"
              as="textarea"
              rows={3}
              name="Instructions"
              label="Instructions"
              registerProps={register("instructions")}
              error={errors.instructions}
              placeholder='eg. Apply this rule to all "receipts"'
              tooltipText="The instructions that will be passed to the AI."
            />
          </div>
        </TabsContent>
        <TabsContent value={RuleType.STATIC}>
          <div className="mt-4 space-y-4">
            <Input
              type="text"
              name="from"
              label="From"
              registerProps={register("from")}
              error={errors.from}
              placeholder="eg. elie@getinboxzero.com"
              tooltipText="Only apply this rule to emails from this address."
            />
            <Input
              type="text"
              name="to"
              label="To"
              registerProps={register("to")}
              error={errors.to}
              placeholder="eg. elie@getinboxzero.com"
              tooltipText="Only apply this rule to emails sent to this address."
            />
            <Input
              type="text"
              name="subject"
              label="Subject"
              registerProps={register("subject")}
              error={errors.subject}
              placeholder="eg. Receipt for your purchase"
              tooltipText="Only apply this rule to emails with this subject."
            />
            {/* <Input
                  type="text"
                  name="body"
                  label="Body"
                  registerProps={register("body")}
                  error={errors.body}
                  placeholder="eg. Thanks for your purchase!"
                  tooltipText="Only apply this rule to emails with this body."
                /> */}
          </div>
        </TabsContent>
        <TabsContent value={RuleType.GROUP}>
          <GroupsTab
            registerProps={register("groupId")}
            setValue={setValue}
            errors={errors}
            groupId={watch("groupId")}
          />
        </TabsContent>
      </Tabs>

      <TypographyH3 className="mt-6">Actions</TypographyH3>

      <div className="mt-4 space-y-4">
        {watch("actions")?.map((action, i) => {
          return (
            <Card key={i}>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  <Select
                    name={`actions.${i}.type`}
                    label="Action type"
                    options={Object.keys(ActionType).map((action) => ({
                      label: capitalCase(action),
                      value: action,
                    }))}
                    registerProps={register(`actions.${i}.type`)}
                    error={
                      errors["actions"]?.[i]?.["type"] as FieldError | undefined
                    }
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => remove(i)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="col-span-3 space-y-4">
                  {actionInputs[action.type].fields.map((field) => {
                    const isAiGenerated = action[field.name]?.ai;

                    return (
                      <div key={field.label}>
                        <div className="flex items-center justify-between">
                          <Label name={field.name} label={field.label} />
                          <div className="flex items-center space-x-2">
                            <TooltipExplanation text="If enabled the AI will generate this value in real time when processing your emails. If you want the same value each time then set it here and disable real-time AI generation." />
                            <Toggle
                              name={`actions.${i}.${field.name}.ai`}
                              label="AI generated"
                              enabled={isAiGenerated || false}
                              onChange={(enabled) => {
                                setValue(
                                  `actions.${i}.${field.name}`,
                                  enabled
                                    ? { value: "", ai: true }
                                    : { value: "", ai: false },
                                );
                              }}
                            />
                          </div>
                        </div>

                        {field.name === "label" ? (
                          <div className="mt-2">
                            <LabelCombobox
                              userLabels={userLabels}
                              isLoading={isLoading}
                              mutate={mutate}
                              value={action[field.name]?.value || ""}
                              onChangeValue={(value) => {
                                setValue(
                                  `actions.${i}.${field.name}.value`,
                                  value,
                                );
                              }}
                            />
                          </div>
                        ) : field.textArea ? (
                          <textarea
                            className="mt-2 block w-full flex-1 whitespace-pre-wrap rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                            rows={3}
                            placeholder={
                              isAiGenerated ? "AI prompt (optional)" : ""
                            }
                            {...register(`actions.${i}.${field.name}.value`)}
                          />
                        ) : (
                          <input
                            className="mt-2 block w-full flex-1 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                            type="text"
                            placeholder={
                              isAiGenerated ? "AI prompt (optional)" : ""
                            }
                            {...register(`actions.${i}.${field.name}.value`)}
                          />
                        )}

                        {errors["actions"]?.[i]?.[field.name]?.message ? (
                          <ErrorMessage
                            message={
                              errors["actions"]?.[i]?.[field.name]?.message!
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => append({ type: ActionType.LABEL })}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Action
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-end space-x-2">
        <Tooltip content="If enabled our AI will perform actions automatically. If disabled, you will have to confirm actions first.">
          <HelpCircleIcon className="h-5 w-5 cursor-pointer" />
        </Tooltip>

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
        <Tooltip content="Enable to run this rule on all emails, including threads. When disabled the rule only runs on individual emails.">
          <HelpCircleIcon className="h-5 w-5 cursor-pointer" />
        </Tooltip>

        <Toggle
          name="runOnThreads"
          label="Run on threads"
          enabled={watch("runOnThreads") || false}
          onChange={(enabled) => {
            setValue("runOnThreads", enabled);
          }}
        />
      </div>

      <div className="flex justify-end space-x-2 py-6">
        {rule.id ? (
          <>
            {rule.type !== RuleType.AI && (
              <Button variant="outline" asChild>
                <Link href={`/automation/rule/${rule.id}/examples`}>
                  View Examples
                </Link>
              </Button>
            )}
            <Button type="submit">
              {isSubmitting && <ButtonLoader />}
              Save
            </Button>
          </>
        ) : (
          <Button type="submit">
            {isSubmitting && <ButtonLoader />}
            Create
          </Button>
        )}
      </div>
    </form>
  );
}

function GroupsTab(props: {
  registerProps: UseFormRegisterReturn;
  setValue: UseFormSetValue<CreateRuleBody>;
  errors: FieldErrors<CreateRuleBody>;
  groupId?: string | null;
}) {
  const { setValue } = props;
  const { data, isLoading, error, mutate } =
    useSWR<GroupsResponse>(`/api/user/group`);
  const [loadingCreateGroup, setLoadingCreateGroup] = useState(false);

  useEffect(() => {
    async function createGroup(groupId: string) {
      setLoadingCreateGroup(true);

      const result = await createPredefinedGroupAction(groupId);

      if (isActionError(result)) {
        toastError({ description: result.error });
      } else if (!result) {
        toastError({ description: "Error creating group" });
      } else {
        mutate();
        setValue("groupId", result.id);
      }

      setLoadingCreateGroup(false);
    }

    if (
      props.groupId === NEWSLETTER_GROUP_ID ||
      props.groupId === RECEIPT_GROUP_ID
    ) {
      createGroup(props.groupId);
    }
  }, [mutate, props.groupId, setValue]);

  return (
    <div className="mt-4">
      <SectionDescription>
        A group is a collection of senders or subjects. For example, a group
        could be all receipts or all newsletters.
      </SectionDescription>

      {loadingCreateGroup && (
        <MessageText className="my-4 text-center">
          Creating group with AI... This will take up to 30 seconds.
        </MessageText>
      )}

      <LoadingContent loading={isLoading || loadingCreateGroup} error={error}>
        <div className="mt-2 flex items-center space-x-2">
          {data?.groups && data?.groups.length > 0 && (
            <div className="min-w-[250px]">
              <Select
                name="groupId"
                label=""
                options={data.groups.map((group) => ({
                  label: group.name,
                  value: group.id,
                }))}
                registerProps={props.registerProps}
                error={props.errors["groupId"]}
              />
            </div>
          )}

          {props.groupId && (
            <ViewGroupButton
              groupId={props.groupId}
              name="View group"
              ButtonComponent={({ onClick }) => (
                <Button variant="outline" onClick={onClick}>
                  View group
                </Button>
              )}
            />
          )}
          <CreateGroupModalButton
            existingGroups={data?.groups.map((group) => group.name) || []}
            buttonVariant="outline"
          />
        </div>
      </LoadingContent>
    </div>
  );
}

function LabelCombobox({
  value,
  onChangeValue,
  userLabels,
  isLoading,
  mutate,
}: {
  value: string;
  onChangeValue: (value: string) => void;
  userLabels: NonNullable<LabelsResponse["labels"]>;
  isLoading: boolean;
  mutate: () => void;
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
                    const res = await createLabelAction({ name: search });
                    mutate();
                    if (isActionError(res)) throw new Error(res.error);
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

function cleanRule(rule: CreateRuleBody, type: RuleType) {
  if (type === RuleType.STATIC) {
    return {
      ...rule,
      type: RuleType.STATIC,
      // instructions: null,
      groupId: null,
    };
  }
  if (type === RuleType.GROUP) {
    return {
      ...rule,
      type: RuleType.GROUP,
      // instructions: null,
      from: null,
      to: null,
      subject: null,
      body: null,
    };
  }
  // type === RuleType.AI
  return {
    ...rule,
    type: RuleType.AI,
    groupId: null,
    from: null,
    to: null,
    subject: null,
    body: null,
  };
}
