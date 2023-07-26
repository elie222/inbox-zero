"use client";

import { useCallback } from "react";
import { SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { capitalCase } from "capital-case";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/solid";
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
  UpdateRulesResponse,
  type RulesResponse,
} from "@/app/api/user/rules/controller";
import {
  UpdateRulesBody,
  updateRulesBody,
} from "@/app/api/user/rules/validation";
import { Toggle } from "@/components/Toggle";
import { Tooltip } from "@/components/Tooltip";
import { Tag } from "@/components/Tag";

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
  } = useForm<UpdateRulesBody>({
    resolver: zodResolver(updateRulesBody),
    defaultValues: {
      rules: props.rules.length
        ? props.rules.map((r) => ({
            id: r.id,
            value: r.instructions,
            actions: r.actions,
            automate: !!r.automate,
          }))
        : [{ value: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ name: "rules", control });

  const onSubmit: SubmitHandler<UpdateRulesBody> = useCallback(async (data) => {
    const res = await postRequest<UpdateRulesResponse, UpdateRulesBody>(
      "/api/user/rules",
      data
    );

    if (isErrorMessage(res)) {
      toastError({ description: "There was an error updating the rules." });
    } else {
      toastSuccess({
        description: "Rules updated successfully.",
      });
    }
  }, []);

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
                      name={`rules.${i}.value`}
                      registerProps={register(`rules.${i}.value`)}
                      error={errors.rules?.[i]?.value}
                      onClickAdd={() => append({ value: "" })}
                      onClickRemove={
                        fields.length > 1 ? () => remove(i) : undefined
                      }
                    />
                    <div className="mt-2 flex justify-between">
                      <div className="flex space-x-2">
                        {f.actions?.map((action) => {
                          return (
                            <Tag key={action} color="green">
                              {capitalCase(action)}
                            </Tag>
                          );
                        })}
                      </div>
                      <div className="flex items-center">
                        <Tooltip content="If enabled Inbox Zero will perform the actions automatically. If disabled you will first have to confirm the plan of action.">
                          <QuestionMarkCircleIcon className="h-5 w-5" />
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
    </FormSection>
  );
}
