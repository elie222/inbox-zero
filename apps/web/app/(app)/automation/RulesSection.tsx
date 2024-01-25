"use client";

import { useCallback, useState } from "react";
import { SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { capitalCase } from "capital-case";
import { usePostHog } from "posthog-js/react";
import {
  ForwardIcon,
  HelpCircleIcon,
  MailQuestionIcon,
  PenIcon,
} from "lucide-react";
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
import { type UpdateRuleBody } from "@/app/api/user/rules/[id]/validation";
import { AlertBasic } from "@/components/Alert";
import { TestRules } from "@/app/(app)/automation/TestRules";
import { RuleModal } from "@/app/(app)/automation/RuleModal";

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
    title: "Forward receipts",
    description: "Forward receipts to alice@accountant.com.",
    icon: <ForwardIcon className="h-4 w-4" />,
  },
  {
    title: "Respond to support request",
    description: `If someone asks how much the premium plan is, respond: "Our premium plan is $10 per month."`,
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
    formState: { errors, isSubmitting, isDirty },
    control,
    watch,
    setValue,
    reset,
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
  const posthog = usePostHog();

  const onSubmit: SubmitHandler<UpdateRulesBody> = useCallback(
    async (data) => {
      // First save the rules to the database
      // Then AI categorize them

      const res = await postRequest<UpdateRulesResponse, UpdateRulesBody>(
        "/api/user/rules",
        data,
      );

      posthog.capture("Clicked Save Rules");

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

      refetchRules();

      reset(data);
    },
    [setValue, props.rules, refetchRules, posthog, reset],
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

                  posthog.capture("Clicked Example Rule", {
                    example: example.title,
                  });
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
          The the actions we can take on your behalf:{" "}
          {Object.keys(ActionType)
            .map((action) => capitalCase(action))
            .join(", ")}
          .
        </SectionDescription>
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
                      onClickAdd={() => {
                        append({ instructions: "" });
                        posthog.capture("Clicked Add Rule");
                      }}
                      onClickRemove={
                        fields.length > 1
                          ? () => {
                              remove(i);
                              posthog.capture("Clicked Remove Rule");
                            }
                          : undefined
                      }
                    />
                    <div className="mt-2 flex">
                      <div className="flex flex-1 space-x-2">
                        {props.rules?.[i]?.actions?.map((action) => {
                          return (
                            <Tag key={action.id} color="green">
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
                              posthog.capture("Clicked Edit Rule");
                            }}
                          >
                            <PenIcon className="h-5 w-5" />
                          </Button>
                        </div>
                      ) : null}
                      <div className="ml-4 flex items-center">
                        <Tooltip content="If enabled our AI will perform actions automatically. If disabled, you will have to confirm actions first.">
                          <HelpCircleIcon className="h-5 w-5 cursor-pointer" />
                        </Tooltip>
                        <div className="ml-2">
                          <Toggle
                            label="Automate"
                            name={`rules.${i}.automate`}
                            enabled={!!watch(`rules.${i}.automate`)}
                            onChange={(value) => {
                              setValue(`rules.${i}.automate`, value);
                              posthog.capture("Clicked Automate Rule");
                            }}
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
          <Button
            type="submit"
            size="lg"
            loading={isSubmitting}
            className="mt-4"
          >
            Save
          </Button>
        </form>

        <div className="mt-2 flex items-center">
          <TestRules
            disabled={!watch("rules").find((f) => f.instructions?.trim())}
          />
          {isDirty && (
            <div className="ml-4 flex items-center justify-end text-sm text-gray-700">
              Click save to test new rules.
            </div>
          )}
        </div>
      </div>

      <RuleModal
        rule={edittingRule}
        closeModal={() => setEdittingRule(undefined)}
        refetchRules={props.refetchRules}
      />
    </FormSection>
  );
}
