"use client";

import { useCallback, useState } from "react";
import {
  FieldError,
  SubmitHandler,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { capitalCase } from "capital-case";
import { PlusIcon } from "lucide-react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SubmitButtonWrapper } from "@/components/Form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { SectionDescription, SectionHeader } from "@/components/Typography";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { ActionType } from "@prisma/client";
import { Modal } from "@/components/Modal";
import {
  updateRuleBody,
  type UpdateRuleBody,
  type UpdateRuleResponse,
} from "@/app/api/user/rules/[id]/validation";
import { actionInputs } from "@/utils/actionType";
import { Select } from "@/components/Select";
import { AlertBasic } from "@/components/Alert";

export function RuleModal(props: {
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

  const { append, remove } = useFieldArray({ control, name: "actions" });

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

      {!watch("actions")?.length && (
        <div className="mt-8 flex justify-center">
          <div className="text-gray-700">No actions</div>
        </div>
      )}
      <div className="mt-4">
        <Button
          color="white"
          full
          onClick={() => append({ type: ActionType.LABEL })}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Action
        </Button>
      </div>
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
