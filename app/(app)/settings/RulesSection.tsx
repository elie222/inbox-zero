"use client";

import { useCallback, useState } from "react";
import { SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { capitalCase } from "capital-case";
import { Card } from "@tremor/react";
import { HelpCircleIcon, PenIcon } from "lucide-react";
import { Button } from "@/components/Button";
import {
  FormSection,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { SectionDescription, SectionHeader } from "@/components/Typography";
import { postRequest } from "@/utils/api";
import { isErrorMessage } from "@/utils/error";
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

export function RulesSection() {
  const { data, isLoading, error } = useSWR<RulesResponse, { error: string }>(
    `/api/user/rules`
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && <RulesForm rules={data} />}
    </LoadingContent>
  );
}

export function RulesForm(props: { rules: RulesResponse }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    control,
    watch,
    setValue,
    getValues,
  } = useForm<UpdateRulesBody>({
    resolver: zodResolver(updateRulesBody),
    defaultValues: {
      rules: props.rules.length
        ? props.rules.map((r) => ({
            id: r.id,
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
      const res = await postRequest<UpdateRulesResponse, UpdateRulesBody>(
        "/api/user/rules",
        data
      );

      if (isErrorMessage(res)) {
        toastError({ description: "There was an error updating the rules." });
      } else {
        // update ids
        for (let i = 0; i < data.rules.length; i++) {
          const rule = data.rules[i];
          const updatedRule = res.find(
            (r) => r.instructions === rule.instructions
          );
          if (updatedRule) setValue(`rules.${i}.id`, updatedRule.id);
        }

        await Promise.all(
          res.map(async (r) => {
            const categorizedRule = await postRequest<
              CategorizeRuleResponse,
              CategorizeRuleBody
            >("/api/user/rules/categorize", {
              ruleId: r.id,
            });

            if (isErrorMessage(categorizedRule)) {
              console.error("Error categorizing rule:", r);
              console.error("Error:", categorizedRule);
              return;
            }

            if (categorizedRule) {
              const index = data.rules.findIndex(
                (r) => r.id === categorizedRule.id
              );

              if (index !== -1) setValue(`rules.${index}`, categorizedRule);
            }
          })
        );

        toastSuccess({
          description: "Rules updated successfully.",
        });
      }
    },
    [setValue]
  );

  const [edittingRule, setEdittingRule] = useState<UpdateRuleBody>();

  return (
    <FormSection>
      <div className="">
        <SectionHeader>Rules</SectionHeader>
        <SectionDescription>
          Instruct the AI how you want it to handle your emails.
        </SectionDescription>
        <SectionDescription>Examples of rules you can add:</SectionDescription>
        <ul className="mt-1 list-inside list-disc text-sm leading-6 text-gray-700">
          <li>Forward all receipts to alice@accountant.com.</li>
          <li>
            Label all cold emails as {'"'}Cold Email{'"'}.
          </li>
          <li>
            If someone asks how much the premium plan is respond: {'"'}Our
            premium plan is $10 per month. You can learn more at
            https://getinboxzero.com/pricing.{'"'}
          </li>
        </ul>
        <SectionDescription>
          These are the actions we can take on your behalf:{" "}
          {Object.keys(ActionType)
            .map((action) => capitalCase(action))
            .join(", ")}
          .
        </SectionDescription>
      </div>

      <div className="md:col-span-2">
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
                        {watch(`rules.${i}.actions`)?.map((action) => {
                          return (
                            <Tag key={action.type} color="green">
                              {capitalCase(action.type)}
                            </Tag>
                          );
                        })}
                      </div>
                      {watch(`rules.${i}.id`) ? (
                        <div className="ml-4 flex items-center">
                          <Button
                            size="xs"
                            color="transparent"
                            onClick={() => {
                              const rule = getValues(`rules.${i}`);

                              if (rule.id) {
                                setEdittingRule({ id: rule.id, ...rule });
                              }
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
      />
    </FormSection>
  );
}

function RuleModal(props: { rule?: UpdateRuleBody; closeModal: () => void }) {
  return (
    <Modal
      isOpen={Boolean(props.rule)}
      hideModal={props.closeModal}
      title="Edit Rule"
      size="2xl"
    >
      {props.rule && (
        <UpdateRuleForm rule={props.rule} closeModal={props.closeModal} />
      )}
    </Modal>
  );
}

function UpdateRuleForm(props: {
  rule: UpdateRuleBody;
  closeModal: () => void;
}) {
  const { closeModal } = props;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateRuleBody>({
    resolver: zodResolver(updateRuleBody),
    defaultValues: props.rule,
  });

  const onSubmit: SubmitHandler<UpdateRuleBody> = useCallback(
    async (data) => {
      if (!props.rule.id) return;
      const res = await postRequest<UpdateRuleResponse, UpdateRuleBody>(
        `/api/user/rules/${props.rule.id}`,
        data
      );
      if (isErrorMessage(res)) {
        console.error(res);
        toastError({ description: `There was an error updating the rule.` });
      } else {
        toastSuccess({ description: `Saved!` });
        closeModal();
      }
    },
    [props.rule.id, closeModal]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="mt-4">
        <Card>{props.rule?.instructions}</Card>
        <div className="mt-8">
          <SectionDescription>
            This is how the AI will handle your emails. If a field is left blank
            the AI will generate the content based on the rule in real time
            while processing an email.
          </SectionDescription>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {props.rule?.actions?.map((action, i) => {
          return (
            <Card key={i}>
              <div className="grid grid-cols-4 gap-4">
                <SectionHeader>{capitalCase(action.type)}</SectionHeader>
                <div className="col-span-3 space-y-4">
                  {actionInputs[action.type].fields.map((field) => {
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
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
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
