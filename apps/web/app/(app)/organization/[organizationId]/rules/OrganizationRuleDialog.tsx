"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { PlusIcon, XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toastSuccess, toastError } from "@/components/Toast";
import { ActionType } from "@/generated/prisma/enums";
import {
  createOrganizationRuleAction,
  updateOrganizationRuleAction,
} from "@/utils/actions/organization-rule";
import type { OrganizationRulesResponse } from "@/app/api/organizations/[organizationId]/rules/route";
import type { OrganizationTeamsResponse } from "@/app/api/organizations/[organizationId]/teams/route";

type OrganizationRuleItem = OrganizationRulesResponse["rules"][number];

const ACTION_TYPE_OPTIONS: { value: ActionType; label: string }[] = [
  { value: ActionType.ARCHIVE, label: "Archive" },
  { value: ActionType.LABEL, label: "Label" },
  { value: ActionType.DRAFT_EMAIL, label: "Draft reply" },
  { value: ActionType.REPLY, label: "Reply" },
  { value: ActionType.FORWARD, label: "Forward" },
  { value: ActionType.SEND_EMAIL, label: "Send email" },
  { value: ActionType.MARK_READ, label: "Mark read" },
  { value: ActionType.MARK_SPAM, label: "Mark spam" },
  { value: ActionType.STAR, label: "Star" },
  { value: ActionType.MOVE_FOLDER, label: "Move to folder" },
  { value: ActionType.DIGEST, label: "Digest" },
];

type ActionFieldName =
  | "label"
  | "to"
  | "cc"
  | "bcc"
  | "subject"
  | "content"
  | "folderName";

type ActionFieldConfig = {
  name: ActionFieldName;
  label: string;
  textarea?: boolean;
  required?: boolean;
};

const ACTION_FIELDS: Partial<Record<ActionType, ActionFieldConfig[]>> = {
  [ActionType.LABEL]: [{ name: "label", label: "Label name", required: true }],
  [ActionType.FORWARD]: [{ name: "to", label: "Forward to", required: true }],
  [ActionType.SEND_EMAIL]: [
    { name: "to", label: "To", required: true },
    { name: "subject", label: "Subject" },
    { name: "content", label: "Content", textarea: true },
  ],
  [ActionType.REPLY]: [
    { name: "content", label: "Reply template (optional)", textarea: true },
  ],
  [ActionType.DRAFT_EMAIL]: [
    { name: "content", label: "Draft template (optional)", textarea: true },
  ],
  [ActionType.MOVE_FOLDER]: [
    { name: "folderName", label: "Folder name", required: true },
  ],
};

type ActionFormValues = {
  type: ActionType;
  label: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  content: string;
  folderName: string;
};

type OrganizationRuleFormValues = {
  name: string;
  instructions: string;
  from: string;
  to: string;
  subject: string;
  teamIds: string[];
  actions: ActionFormValues[];
};

export function OrganizationRuleDialog({
  organizationId,
  rule,
  teams,
  onClose,
  onSuccess,
}: {
  organizationId: string;
  rule?: OrganizationRuleItem;
  teams: OrganizationTeamsResponse["teams"];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationRuleFormValues>({
    defaultValues: rule ? toFormValues(rule) : emptyFormValues(),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "actions",
  });

  const actions = watch("actions");
  const teamIds = watch("teamIds");

  const onSubmit = handleSubmit(async (data) => {
    const payload = {
      name: data.name,
      instructions: emptyToNull(data.instructions),
      from: emptyToNull(data.from),
      to: emptyToNull(data.to),
      subject: emptyToNull(data.subject),
      teamIds: data.teamIds,
      actions: data.actions.map((action) => ({
        type: action.type,
        label: emptyToNull(action.label),
        to: emptyToNull(action.to),
        cc: emptyToNull(action.cc),
        bcc: emptyToNull(action.bcc),
        subject: emptyToNull(action.subject),
        content: emptyToNull(action.content),
        folderName: emptyToNull(action.folderName),
      })),
    };

    if (
      !payload.instructions &&
      !payload.from &&
      !payload.to &&
      !payload.subject
    ) {
      toastError({
        description:
          "Please add at least one condition (AI instructions, from, to, or subject)",
      });
      return;
    }

    const result = rule
      ? await updateOrganizationRuleAction({ id: rule.id, ...payload })
      : await createOrganizationRuleAction({ organizationId, ...payload });

    if (result?.serverError || result?.validationErrors) {
      toastError({
        title: `Error ${rule ? "updating" : "creating"} rule`,
        description:
          result.serverError || "Please check the rule fields and try again.",
      });
      return;
    }

    const sync = result?.data?.sync;
    toastSuccess({
      description: sync
        ? `Rule ${rule ? "updated" : "created"}. Applied to ${
            sync.createdCount + sync.updatedCount
          } member account${
            sync.createdCount + sync.updatedCount === 1 ? "" : "s"
          }.`
        : `Rule ${rule ? "updated" : "created"}.`,
    });

    if (sync?.skipped.length) {
      toastError({
        title: "Some accounts were skipped",
        description: sync.skipped
          .map((s) => `${s.email}: ${s.reason}`)
          .join("\n"),
      });
    }

    onSuccess();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? "Edit organization rule" : "New organization rule"}
          </DialogTitle>
          <DialogDescription>
            This rule is applied to the inbox of every member it targets.
            Members can see it but only organization admins can change it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6">
          <Input
            type="text"
            name="name"
            label="Name"
            placeholder="e.g. Security alerts"
            registerProps={register("name", {
              required: "Please enter a name",
            })}
            error={errors.name}
          />

          <div className="space-y-2">
            <Label>Conditions</Label>
            <Input
              type="text"
              name="instructions"
              autosizeTextarea
              rows={3}
              label="AI instructions"
              placeholder="e.g. Emails reporting a security incident or vulnerability"
              registerProps={register("instructions")}
              error={errors.instructions}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input
                type="text"
                name="from"
                label="From"
                placeholder="e.g. @vendor.com"
                registerProps={register("from")}
                error={errors.from}
              />
              <Input
                type="text"
                name="to"
                label="To"
                placeholder="e.g. support@"
                registerProps={register("to")}
                error={errors.to}
              />
              <Input
                type="text"
                name="subject"
                label="Subject"
                placeholder="e.g. [Incident]"
                registerProps={register("subject")}
                error={errors.subject}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Actions</Label>
            {fields.map((field, index) => {
              const actionType = actions[index]?.type;
              const extraFields =
                (actionType && ACTION_FIELDS[actionType]) || [];

              return (
                <div key={field.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={actionType}
                      onValueChange={(value) =>
                        setValue(`actions.${index}.type`, value as ActionType, {
                          shouldDirty: true,
                        })
                      }
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select an action" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label="Remove action"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>

                  {extraFields.map((fieldConfig) => (
                    <Input
                      key={fieldConfig.name}
                      type="text"
                      name={`actions.${index}.${fieldConfig.name}`}
                      label={fieldConfig.label}
                      autosizeTextarea={fieldConfig.textarea}
                      rows={fieldConfig.textarea ? 3 : undefined}
                      registerProps={register(
                        `actions.${index}.${fieldConfig.name}`,
                        fieldConfig.required
                          ? {
                              required: `Please enter a ${fieldConfig.label.toLowerCase()}`,
                            }
                          : undefined,
                      )}
                      error={errors.actions?.[index]?.[fieldConfig.name]}
                    />
                  ))}
                </div>
              );
            })}

            <Button
              type="button"
              variant="ghost"
              onClick={() => append(emptyAction())}
              className="px-2 -ml-2"
            >
              <PlusIcon className="size-4 mr-2" />
              Add action
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Applies to</Label>
            <p className="text-sm text-muted-foreground">
              {teams.length
                ? "Select teams this rule applies to. Leave all unchecked to apply it to every member."
                : "This rule applies to every member. Create teams on the rules page to target specific groups."}
            </p>
            {teams.map((team) => (
              <div key={team.id} className="flex items-center gap-2">
                <Checkbox
                  id={`team-${team.id}`}
                  checked={teamIds.includes(team.id)}
                  onCheckedChange={(checked) => {
                    setValue(
                      "teamIds",
                      checked
                        ? [...teamIds, team.id]
                        : teamIds.filter((id) => id !== team.id),
                      { shouldDirty: true },
                    );
                  }}
                />
                <Label htmlFor={`team-${team.id}`} className="font-normal">
                  {team.name}
                </Label>
              </div>
            ))}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              {rule ? "Save and sync" : "Create and sync"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function emptyAction(): ActionFormValues {
  return {
    type: ActionType.ARCHIVE,
    label: "",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    content: "",
    folderName: "",
  };
}

function emptyFormValues(): OrganizationRuleFormValues {
  return {
    name: "",
    instructions: "",
    from: "",
    to: "",
    subject: "",
    teamIds: [],
    actions: [emptyAction()],
  };
}

function toFormValues(rule: OrganizationRuleItem): OrganizationRuleFormValues {
  return {
    name: rule.name,
    instructions: rule.instructions ?? "",
    from: rule.from ?? "",
    to: rule.to ?? "",
    subject: rule.subject ?? "",
    teamIds: rule.teams.map((team) => team.id),
    actions: rule.actions.length
      ? rule.actions.map((action) => ({
          type: action.type,
          label: action.label ?? "",
          to: action.to ?? "",
          cc: action.cc ?? "",
          bcc: action.bcc ?? "",
          subject: action.subject ?? "",
          content: action.content ?? "",
          folderName: action.folderName ?? "",
        }))
      : [emptyAction()],
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
