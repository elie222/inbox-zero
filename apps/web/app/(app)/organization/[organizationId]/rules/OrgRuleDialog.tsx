"use client";

import { useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { TrashIcon, PlusIcon } from "lucide-react";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/Toggle";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAction } from "next-safe-action/hooks";
import {
  createOrganizationRuleAction,
  updateOrganizationRuleAction,
} from "@/utils/actions/organization-rule";
import type { OrganizationRuleActionSchema } from "@/utils/actions/organization-rule.validation";
import type { OrganizationRulesResponse } from "@/app/api/organizations/[organizationId]/rules/route";

type OrgRule = OrganizationRulesResponse["rules"][number];

const ACTION_TYPE_OPTIONS: { value: ActionType; label: string }[] = [
  { value: ActionType.LABEL, label: "Label" },
  { value: ActionType.ARCHIVE, label: "Archive" },
  { value: ActionType.MARK_READ, label: "Mark read" },
  { value: ActionType.MARK_SPAM, label: "Mark spam" },
  { value: ActionType.STAR, label: "Star" },
  { value: ActionType.MOVE_FOLDER, label: "Move to folder" },
  { value: ActionType.FORWARD, label: "Forward" },
  { value: ActionType.REPLY, label: "Reply" },
  { value: ActionType.SEND_EMAIL, label: "Send email" },
  { value: ActionType.DRAFT_EMAIL, label: "Draft reply" },
  { value: ActionType.CALL_WEBHOOK, label: "Call webhook" },
  { value: ActionType.DIGEST, label: "Add to digest" },
];

const ACTION_TYPE_LABELS = new Map(
  ACTION_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

export function getActionTypeLabel(type: ActionType): string {
  return ACTION_TYPE_LABELS.get(type) ?? type;
}

type ActionFormValue = {
  type: ActionType;
  label: string;
  subject: string;
  content: string;
  to: string;
  cc: string;
  bcc: string;
  url: string;
  folderName: string;
};

type OrgRuleFormValues = {
  name: string;
  instructions: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  conditionalOperator: LogicalOperator;
  runOnThreads: boolean;
  actions: ActionFormValue[];
};

const EMPTY_ACTION: ActionFormValue = {
  type: ActionType.LABEL,
  label: "",
  subject: "",
  content: "",
  to: "",
  cc: "",
  bcc: "",
  url: "",
  folderName: "",
};

export function OrgRuleDialog({
  organizationId,
  rule,
  isOpen,
  onClose,
  onSuccess,
}: {
  organizationId: string;
  rule?: OrgRule;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const editing = !!rule;
  const values = useMemo(() => toFormValues(rule), [rule]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OrgRuleFormValues>({ values });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "actions",
  });
  const watchedActions = watch("actions");

  const createAction = useAction(createOrganizationRuleAction);
  const updateAction = useAction(updateOrganizationRuleAction);
  const isSubmitting = createAction.isExecuting || updateAction.isExecuting;

  const onSubmit = handleSubmit(async (formValues) => {
    const actions = formValues.actions.map((action) => ({
      // The Select only offers supported types; validated again server-side.
      type: action.type as OrganizationRuleActionSchema["type"],
      label: action.label || null,
      subject: action.subject || null,
      content: action.content || null,
      to: action.to || null,
      cc: action.cc || null,
      bcc: action.bcc || null,
      url: action.url || null,
      folderName: action.folderName || null,
    }));

    const shared = {
      name: formValues.name,
      instructions: formValues.instructions || null,
      from: formValues.from || null,
      to: formValues.to || null,
      subject: formValues.subject || null,
      body: formValues.body || null,
      conditionalOperator: formValues.conditionalOperator,
      runOnThreads: formValues.runOnThreads,
      actions,
    };

    const result =
      editing && rule
        ? await updateAction.executeAsync({
            organizationId,
            organizationRuleId: rule.id,
            ...shared,
          })
        : await createAction.executeAsync({ organizationId, ...shared });

    if (result?.serverError || result?.validationErrors) {
      toastError({
        description:
          result.serverError ||
          "There was an error saving the rule. Please check the fields and try again.",
      });
      return;
    }

    toastSuccess({
      description: editing ? "Rule updated" : "Rule created",
    });
    onSuccess();
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit organization rule" : "New organization rule"}
          </DialogTitle>
          <DialogDescription>
            This rule applies to every member of your organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            type="text"
            name="name"
            label="Name"
            registerProps={register("name")}
            error={errors.name}
            placeholder="e.g. Label invoices"
          />

          <Input
            type="text"
            as="textarea"
            autosizeTextarea
            rows={2}
            name="instructions"
            label="AI instructions"
            explainText="Describe in natural language which emails this rule should match."
            registerProps={register("instructions")}
            error={errors.instructions}
            placeholder="e.g. Emails that look like invoices or receipts"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              type="text"
              name="from"
              label="From (static)"
              registerProps={register("from")}
              error={errors.from}
              placeholder="e.g. @stripe.com"
            />
            <Input
              type="text"
              name="to"
              label="To (static)"
              registerProps={register("to")}
              error={errors.to}
            />
            <Input
              type="text"
              name="subject"
              label="Subject (static)"
              registerProps={register("subject")}
              error={errors.subject}
            />
            <Input
              type="text"
              name="body"
              label="Body (static)"
              registerProps={register("body")}
              error={errors.body}
            />
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="space-y-1">
              <Label>Match conditions with</Label>
              <Controller
                control={control}
                name="conditionalOperator"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LogicalOperator.AND}>AND</SelectItem>
                      <SelectItem value={LogicalOperator.OR}>OR</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Controller
              control={control}
              name="runOnThreads"
              render={({ field }) => (
                <div className="space-y-1">
                  <Label>Apply to threads</Label>
                  <Toggle
                    name="runOnThreads"
                    enabled={field.value}
                    onChange={field.onChange}
                  />
                </div>
              )}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Actions</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => append(EMPTY_ACTION)}
              >
                <PlusIcon className="mr-2 size-4" />
                Add action
              </Button>
            </div>

            {fields.map((fieldItem, index) => {
              const type = watchedActions?.[index]?.type ?? ActionType.LABEL;
              return (
                <div
                  key={fieldItem.id}
                  className="space-y-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Controller
                      control={control}
                      name={`actions.${index}.type`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTION_TYPE_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>

                  <ActionFields index={index} type={type} register={register} />
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="submit" loading={isSubmitting}>
              {editing ? "Save rule" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionFields({
  index,
  type,
  register,
}: {
  index: number;
  type: ActionType;
  register: ReturnType<typeof useForm<OrgRuleFormValues>>["register"];
}) {
  if (type === ActionType.LABEL) {
    return (
      <Input
        type="text"
        name={`actions.${index}.label`}
        label="Label name"
        registerProps={register(`actions.${index}.label`)}
      />
    );
  }

  if (type === ActionType.MOVE_FOLDER) {
    return (
      <Input
        type="text"
        name={`actions.${index}.folderName`}
        label="Folder name"
        registerProps={register(`actions.${index}.folderName`)}
      />
    );
  }

  if (type === ActionType.CALL_WEBHOOK) {
    return (
      <Input
        type="text"
        name={`actions.${index}.url`}
        label="Webhook URL"
        registerProps={register(`actions.${index}.url`)}
      />
    );
  }

  if (type === ActionType.FORWARD) {
    return (
      <Input
        type="text"
        name={`actions.${index}.to`}
        label="Forward to"
        registerProps={register(`actions.${index}.to`)}
      />
    );
  }

  if (type === ActionType.SEND_EMAIL || type === ActionType.REPLY) {
    return (
      <div className="space-y-3">
        {type === ActionType.SEND_EMAIL && (
          <Input
            type="text"
            name={`actions.${index}.to`}
            label="To"
            registerProps={register(`actions.${index}.to`)}
          />
        )}
        <Input
          type="text"
          name={`actions.${index}.subject`}
          label="Subject"
          registerProps={register(`actions.${index}.subject`)}
        />
        <Input
          type="text"
          as="textarea"
          autosizeTextarea
          rows={2}
          name={`actions.${index}.content`}
          label="Content"
          registerProps={register(`actions.${index}.content`)}
        />
      </div>
    );
  }

  if (type === ActionType.DRAFT_EMAIL) {
    return (
      <Input
        type="text"
        as="textarea"
        autosizeTextarea
        rows={2}
        name={`actions.${index}.content`}
        label="Draft content (optional)"
        registerProps={register(`actions.${index}.content`)}
      />
    );
  }

  return null;
}

function toFormValues(rule?: OrgRule): OrgRuleFormValues {
  return {
    name: rule?.name ?? "",
    instructions: rule?.instructions ?? "",
    from: rule?.from ?? "",
    to: rule?.to ?? "",
    subject: rule?.subject ?? "",
    body: rule?.body ?? "",
    conditionalOperator: rule?.conditionalOperator ?? LogicalOperator.AND,
    runOnThreads: rule?.runOnThreads ?? false,
    actions: rule?.actions.length
      ? rule.actions.map((action) => ({
          type: action.type,
          label: action.label ?? "",
          subject: action.subject ?? "",
          content: action.content ?? "",
          to: action.to ?? "",
          cc: action.cc ?? "",
          bcc: action.bcc ?? "",
          url: action.url ?? "",
          folderName: action.folderName ?? "",
        }))
      : [EMPTY_ACTION],
  };
}
