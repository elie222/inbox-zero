"use client";

import { useCallback, useState } from "react";
import {
  FieldError,
  SubmitHandler,
  useFieldArray,
  useForm,
} from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { capitalCase } from "capital-case";
import { Card } from "@/components/Card";
import {
  BookOpenCheckIcon,
  CheckCircle2Icon,
  ForwardIcon,
  HelpCircleIcon,
  MailQuestionIcon,
  PenIcon,
  SnowflakeIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/Button";
import {
  FormSection,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  MessageText,
  SectionDescription,
  SectionHeader,
} from "@/components/Typography";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { LoadingContent } from "@/components/LoadingContent";
import {
  type UpdateRulesResponse,
  type RulesResponse,
} from "@/app/api/user/rules/controller";
import {
  type UpdateRulesBody,
  updateRulesBody,
} from "@/app/api/user/rules/validation";
import { Toggle } from "@/components/Toggle";
import { Tooltip } from "@/components/Tooltip";
import { Tag } from "@/components/Tag";
import {
  type CategorizeRuleBody,
  type CategorizeRuleResponse,
} from "@/app/api/user/rules/categorize/route";
import { ActionType } from "@prisma/client";
import { Modal } from "@/components/Modal";
import {
  updateRuleBody,
  type UpdateRuleBody,
  type UpdateRuleResponse,
} from "@/app/api/user/rules/[id]/validation";
import { actionInputs } from "@/utils/actionType";
import { SlideOverSheet } from "@/components/SlideOverSheet";
import { ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { ActResponse } from "@/app/api/ai/act/controller";
import { MessagesResponse } from "@/app/api/google/messages/route";
import { Separator } from "@/components/ui/separator";
import { Select } from "@/components/Select";
import { AlertBasic } from "@/components/Alert";

export function RulesSection() {
  const { data, isLoading, error, mutate } = useSWR<
    RulesResponse,
    { error: string }
  >(`/api/user/rules`);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && <RulesForm rules={data} refetchRules={mutate} />}
    </LoadingContent>
  );
}

const examples = [
  {
    title: "Archive and label cold emails",
    description: `Archive cold emails and label them "Cold Email".`,
    icon: <SnowflakeIcon className="h-4 w-4" />,
  },
  {
    title: "Forward receipts",
    description: "Forward receipts to alice@accountant.com.",
    icon: <ForwardIcon className="h-4 w-4" />,
  },
  {
    title: "Question response",
    description: `If someone asks how much the premium plan is, respond: "Our premium plan is $8 per month. You can learn more at https://getinboxzero.com/pricing."`,
    icon: <MailQuestionIcon className="h-4 w-4" />,
  },
];

export function RulesForm(props: {
  rules: RulesResponse;
  refetchRules: () => Promise<any>;
}) {
  const { refetchRules } = props;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    control,
    watch,
    setValue,
  } = useForm<UpdateRulesBody>({
    resolver: zodResolver(updateRulesBody),
    defaultValues: {
      rules: props.rules.length
        ? props.rules.map((r) => ({
            id: r.id,
            name: r.name,
            instructions: r.instructions,
            actions: r.actions,
            automate: !!r.automate,
          }))
        : [{ instructions: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ name: "rules", control });

  const onSubmit: SubmitHandler<UpdateRulesBody> = useCallback(
    async (data) => {
      // First save the rules to the database
      // Then AI categorize them

      const res = await postRequest<UpdateRulesResponse, UpdateRulesBody>(
        "/api/user/rules",
        data,
      );

      if (isError(res)) {
        toastError({ description: "There was an error updating the rules." });
      } else {
        // update ids
        for (let i = 0; i < data.rules.length; i++) {
          const rule = data.rules[i];
          const updatedRule = res.find(
            (r) => r.instructions === rule.instructions,
          );
          if (updatedRule) setValue(`rules.${i}.id`, updatedRule.id);
        }

        // AI categorize rules
        await Promise.all(
          res.map(async (r, i) => {
            // if the rule hasn't changed, don't recategorize
            if (r.instructions === props.rules?.[i]?.instructions) return;

            const categorizedRule = await postRequest<
              CategorizeRuleResponse,
              CategorizeRuleBody
            >("/api/user/rules/categorize", {
              ruleId: r.id,
            });

            if (isError(categorizedRule)) {
              console.error("Error categorizing rule:", r);
              console.error("Error:", categorizedRule);
              return;
            }

            if (categorizedRule) {
              const index = data.rules.findIndex(
                (r) => r.id === categorizedRule.id,
              );

              if (index !== -1) setValue(`rules.${index}`, categorizedRule);
            }
          }),
        );

        await refetchRules();

        toastSuccess({
          description: "Rules updated successfully.",
        });
      }

      await refetchRules();
    },
    [setValue, props.rules, refetchRules],
  );

  const [edittingRule, setEdittingRule] = useState<UpdateRuleBody>();

  return (
    <FormSection className="py-8 md:grid-cols-5">
      <div className="md:col-span-2">
        <SectionHeader>Rules</SectionHeader>
        <SectionDescription>
          Instruct the AI how you want it to handle your emails. Examples:
        </SectionDescription>
        <div className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
          {examples.map((example) => {
            return (
              <button
                key={example.title}
                onClick={() => {
                  if (fields.length === 1 && !fields[0].instructions) remove(0);

                  append({ instructions: example.description });
                }}
                className="w-full text-left"
              >
                <AlertBasic
                  title={example.title}
                  description={example.description}
                  icon={example.icon}
                  className="cursor-pointer hover:bg-gray-100"
                />
              </button>
            );
          })}
        </div>
        <SectionDescription className="mt-4">
          These are the actions we can take on your behalf:{" "}
          {Object.keys(ActionType)
            .map((action) => capitalCase(action))
            .join(", ")}
          .
        </SectionDescription>
        <TestRules />
      </div>

      <div className="md:col-span-3">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormSectionRight>
            <div className="space-y-6 sm:col-span-full">
              {fields.map((f, i) => {
                return (
                  <div key={f.id}>
                    <Input
                      type="text"
                      as="textarea"
                      rows={3}
                      name={`rules.${i}.instructions`}
                      registerProps={register(`rules.${i}.instructions`)}
                      error={errors.rules?.[i]?.instructions}
                      onClickAdd={() => append({ instructions: "" })}
                      onClickRemove={
                        fields.length > 1 ? () => remove(i) : undefined
                      }
                    />
                    <div className="mt-2 flex">
                      <div className="flex flex-1 space-x-2">
                        {props.rules?.[i]?.actions?.map((action) => {
                          return (
                            <Tag key={action.type} color="green">
                              {capitalCase(action.type)}
                            </Tag>
                          );
                        })}
                      </div>
                      {props.rules?.[i] ? (
                        <div className="ml-4 flex items-center">
                          <Button
                            size="xs"
                            color="transparent"
                            onClick={() => {
                              setEdittingRule(props.rules?.[i]);
                            }}
                          >
                            <PenIcon className="h-5 w-5" />
                          </Button>
                        </div>
                      ) : null}
                      <div className="ml-4 flex items-center">
                        <Tooltip content="If enabled Inbox Zero will perform the actions automatically. If disabled you will first have to confirm the plan of actionType.">
                          <HelpCircleIcon className="h-5 w-5 cursor-pointer" />
                        </Tooltip>
                        <div className="ml-2">
                          <Toggle
                            label="Automate"
                            name={`rules.${i}.automate`}
                            enabled={!!watch(`rules.${i}.automate`)}
                            onChange={(value) =>
                              setValue(`rules.${i}.automate`, value)
                            }
                            error={errors.rules?.[i]?.automate}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </FormSectionRight>
          <SubmitButtonWrapper>
            <Button type="submit" size="lg" loading={isSubmitting}>
              Save
            </Button>
          </SubmitButtonWrapper>
        </form>
      </div>

      <RuleModal
        rule={edittingRule}
        closeModal={() => setEdittingRule(undefined)}
        refetchRules={props.refetchRules}
      />
    </FormSection>
  );
}

function RuleModal(props: {
  rule?: UpdateRuleBody;
  closeModal: () => void;
  refetchRules: () => Promise<any>;
}) {
  return (
    <Modal
      isOpen={Boolean(props.rule)}
      hideModal={props.closeModal}
      title="Edit Rule"
      size="4xl"
    >
      {props.rule && (
        <UpdateRuleForm
          rule={props.rule}
          closeModal={props.closeModal}
          refetchRules={props.refetchRules}
        />
      )}
    </Modal>
  );
}

function UpdateRuleForm(props: {
  rule: UpdateRuleBody & { id?: string };
  closeModal: () => void;
  refetchRules: () => Promise<any>;
}) {
  const { closeModal, refetchRules } = props;

  const [editingActionType, setEditingActionType] = useState(false);
  const toggleEdittingActionType = useCallback(
    () => setEditingActionType(!editingActionType),
    [setEditingActionType, editingActionType],
  );

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateRuleBody>({
    resolver: zodResolver(updateRuleBody),
    defaultValues: props.rule,
  });

  const { remove } = useFieldArray({ control, name: "actions" });

  const onSubmit: SubmitHandler<UpdateRuleBody> = useCallback(
    async (data) => {
      if (!props.rule.id) return;
      const res = await postRequest<UpdateRuleResponse, UpdateRuleBody>(
        `/api/user/rules/${props.rule.id}`,
        data,
      );

      await refetchRules();

      if (isError(res)) {
        console.error(res);
        toastError({ description: `There was an error updating the rule.` });
      } else {
        toastSuccess({ description: `Saved!` });
        closeModal();
      }
    },
    [props.rule.id, closeModal, refetchRules],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="mt-4">
        <AlertBasic
          title="Instructions"
          description={props.rule.instructions}
          icon={null}
        />

        <div className="mt-4">
          <Input
            type="text"
            name="Name"
            label="Rule name"
            registerProps={register("name")}
            error={errors.name}
            explainText="Used to identify the rule in your inbox."
          />
        </div>

        <div className="mt-8">
          <SectionDescription>
            This is how the AI will handle your emails. If a field is left blank
            the AI will generate the content based on the rule in real time
            while processing an email.
          </SectionDescription>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {watch("actions")?.map((action, i) => {
          return (
            <Card key={i}>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  {editingActionType ? (
                    <Select
                      name={`actions.${i}.type`}
                      label="Action type"
                      options={Object.keys(ActionType).map((action) => ({
                        label: capitalCase(action),
                        value: action,
                      }))}
                      registerProps={register(`actions.${i}.type`)}
                      error={
                        errors["actions"]?.[i]?.["type"] as
                          | FieldError
                          | undefined
                      }
                    />
                  ) : (
                    <div
                      className="cursor-pointer"
                      onClick={toggleEdittingActionType}
                    >
                      <SectionHeader>{capitalCase(action.type)}</SectionHeader>
                    </div>
                  )}

                  <button
                    type="button"
                    className="text-xs hover:text-red-500"
                    onClick={() => remove(i)}
                  >
                    Remove
                  </button>
                </div>
                <div className="col-span-3 space-y-4">
                  {actionInputs[watch(`actions.${i}.type`)].fields.map(
                    (field) => {
                      return (
                        <Input
                          key={field.label}
                          type="text"
                          as={field.textArea ? "textarea" : undefined}
                          rows={field.textArea ? 3 : undefined}
                          name={`actions.${i}.${field.name}`}
                          label={field.label}
                          placeholder="AI Generated"
                          registerProps={register(`actions.${i}.${field.name}`)}
                          error={errors["actions"]?.[i]?.[field.name]}
                        />
                      );
                    },
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {!props.rule.actions?.length && (
        <div className="mt-8 flex justify-center">
          <div className="text-gray-700">No actions</div>
        </div>
      )}
      {/* TODO */}
      {/* <div className="mt-4">
    <Button color="white" full>
      <PlusIcon className="mr-2 h-4 w-4" />
      Add
    </Button>
  </div> */}
      {/* {Boolean(Object.keys(errors).length) && (
        <div className="mt-4">
          <AlertError
            title="Error"
            description={`There was an error updating the rule:\n\n${JSON.stringify(
              errors,
              null,
              2
            )}`}
          />
        </div>
      )} */}
      <div className="flex justify-end">
        <SubmitButtonWrapper>
          <Button type="submit" loading={isSubmitting}>
            Save
          </Button>
        </SubmitButtonWrapper>
      </div>
    </form>
  );
}

function TestRules() {
  return (
    <SlideOverSheet
      title="Test Rules"
      description="Test how your rules perform against real emails."
      content={<TestRulesContent />}
    >
      <Button color="white" className="mt-4">
        <BookOpenCheckIcon className="mr-2 h-4 w-4" />
        Test
      </Button>
    </SlideOverSheet>
  );
}

function TestRulesContent() {
  const { data, isLoading, error } = useSWR<MessagesResponse>(
    "/api/google/messages",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    },
  );

  return (
    <div>
      <div className="mt-4">
        <TestRulesForm />
      </div>

      <div className="mt-4">
        <Separator />
      </div>

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div>
            {data.messages.map((message) => {
              return <TestRulesContentRow key={message.id} message={message} />;
            })}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}

type TestRulesInputs = { message: string };

const TestRulesForm = () => {
  const [plan, setPlan] = useState<ActResponse>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestRulesInputs>();

  const onSubmit: SubmitHandler<TestRulesInputs> = useCallback(async (data) => {
    const res = await postRequest<ActResponse, ActBodyWithHtml>("/api/ai/act", {
      email: {
        from: "",
        to: "",
        date: "",
        replyTo: "",
        cc: "",
        subject: "",
        textPlain: data.message,
        textHtml: "",
        snippet: "",
        threadId: "",
        messageId: "",
        headerMessageId: "",
        references: "",
      },
      allowExecute: false,
    });

    if (isError(res)) {
      console.error(res);
      toastError({ description: `Error planning` });
    } else {
      setPlan(res);
      toastSuccess({ description: `Plan created!` });
    }
  }, []);

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="text"
          as="textarea"
          rows={3}
          name="message"
          label="Email to test against"
          placeholder="Hey, I run a marketing agency, and would love to chat."
          registerProps={register("message", { required: true })}
          error={errors.message}
        />
        <Button type="submit" loading={isSubmitting}>
          <SparklesIcon className="mr-2 h-4 w-4" />
          Plan
        </Button>
      </form>
      {plan && (
        <div className="mt-4">
          <Plan plan={plan} />
        </div>
      )}
    </div>
  );
};

function TestRulesContentRow(props: {
  message: MessagesResponse["messages"][number];
}) {
  const { message } = props;

  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<ActResponse>();

  return (
    <div className="border-b border-gray-200">
      <div className="flex items-center justify-between py-4">
        <div className="min-w-0 break-words">
          <MessageText className="font-bold">
            {message.parsedMessage.headers.subject}
          </MessageText>
          <MessageText className="mt-1">{message.snippet?.trim()}</MessageText>
        </div>
        <div className="ml-4">
          <Button
            color="white"
            loading={planning}
            onClick={async () => {
              setPlanning(true);

              if (!message.parsedMessage.textPlain) {
                toastError({
                  description: `Unable to plan email. No plain text found.`,
                });
                return;
              }

              const res = await postRequest<ActResponse, ActBodyWithHtml>(
                "/api/ai/act",
                {
                  email: {
                    from: message.parsedMessage.headers.from,
                    to: message.parsedMessage.headers.to,
                    date: message.parsedMessage.headers.date,
                    replyTo: message.parsedMessage.headers.replyTo,
                    cc: message.parsedMessage.headers.cc,
                    subject: message.parsedMessage.headers.subject,
                    textPlain: message.parsedMessage.textPlain || null,
                    textHtml: message.parsedMessage.textHtml || null,
                    snippet: message.snippet || null,
                    threadId: message.threadId || "",
                    messageId: message.id || "",
                    headerMessageId:
                      message.parsedMessage.headers.messageId || "",
                    references: message.parsedMessage.headers.references,
                  },
                  allowExecute: false,
                },
              );

              if (isError(res)) {
                console.error(res);
                toastError({
                  description: `There was an error planning the email.`,
                });
              } else {
                setPlan(res);
              }
              setPlanning(false);
            }}
          >
            <SparklesIcon className="mr-2 h-4 w-4" />
            Plan
          </Button>
        </div>
      </div>
      <div>
        <Plan plan={plan} />
      </div>
    </div>
  );
}

function Plan(props: { plan: ActResponse }) {
  const { plan } = props;

  if (!plan) return null;

  if (plan.rule === null) {
    return (
      <AlertBasic
        title="No rule found!"
        description="This email does not match any of the rules you have set."
      />
    );
  }

  if (plan.plannedAction.actions) {
    return (
      <AlertBasic
        title="Rule found!"
        description={plan.rule.instructions}
        icon={<CheckCircle2Icon className="h-4 w-4" />}
      />
    );
  }
}
