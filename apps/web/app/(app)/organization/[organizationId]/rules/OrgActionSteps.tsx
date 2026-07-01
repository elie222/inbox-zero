import type {
  Control,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import { ActionType } from "@/generated/prisma/enums";
import { Input } from "@/components/Input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormControl, FormItem } from "@/components/ui/form";
import { RuleSteps } from "@/app/(app)/[emailAccountId]/assistant/RuleSteps";
import { RuleStep } from "@/app/(app)/[emailAccountId]/assistant/RuleStep";
import { DelayInputControls } from "@/components/DelayInputControls";
import { canActionBeDelayed } from "@/utils/delayed-actions";
import { ACTION_TYPE_LABELS, getActionIcon } from "@/utils/action-display";
import { ORGANIZATION_RULE_ACTION_TYPES } from "@/utils/organizations/rule-action-types";
import {
  EMPTY_ORG_ACTION,
  type OrgRuleFormValues,
  type OrgActionFormValue,
} from "./orgRuleForm";

const ACTION_TYPE_OPTIONS = ORGANIZATION_RULE_ACTION_TYPES.map((value) => ({
  value,
  label: ACTION_TYPE_LABELS[value],
  icon: getActionIcon(value),
}));

export function OrgActionSteps({
  fields,
  register,
  control,
  watch,
  setValue,
  append,
  remove,
}: {
  fields: Array<{ id: string }>;
  register: UseFormRegister<OrgRuleFormValues>;
  control: Control<OrgRuleFormValues>;
  watch: UseFormWatch<OrgRuleFormValues>;
  setValue: UseFormSetValue<OrgRuleFormValues>;
  append: (action: OrgActionFormValue) => void;
  remove: (index: number) => void;
}) {
  const actions = useWatch({ control, name: "actions" }) ?? [];

  return (
    <RuleSteps
      onAdd={() => append(EMPTY_ORG_ACTION)}
      addButtonLabel="Add Action"
      addButtonDisabled={false}
    >
      {fields.map((field, index) => (
        <OrgActionCard
          key={field.id}
          index={index}
          type={actions[index]?.type ?? ActionType.LABEL}
          register={register}
          watch={watch}
          setValue={setValue}
          onRemove={() => remove(index)}
        />
      ))}
    </RuleSteps>
  );
}

function OrgActionCard({
  index,
  type,
  register,
  watch,
  setValue,
  onRemove,
}: {
  index: number;
  type: ActionType;
  register: UseFormRegister<OrgRuleFormValues>;
  watch: UseFormWatch<OrgRuleFormValues>;
  setValue: UseFormSetValue<OrgRuleFormValues>;
  onRemove: () => void;
}) {
  const selectedOption = ACTION_TYPE_OPTIONS.find(
    (option) => option.value === type,
  );
  const SelectedIcon = selectedOption?.icon;
  const delayValue = watch(`actions.${index}.delayInMinutes`);
  const canDelay = canActionBeDelayed(type);
  const delayEnabled = canDelay && delayValue != null;

  const leftContent = (
    <FormItem>
      <Select
        value={type}
        onValueChange={(value) =>
          setValue(`actions.${index}.type`, value as ActionType)
        }
      >
        <FormControl>
          <SelectTrigger className="w-[180px]">
            {selectedOption ? (
              <div className="flex items-center gap-2">
                {SelectedIcon && <SelectedIcon className="size-4" />}
                <span>{selectedOption.label}</span>
              </div>
            ) : (
              <SelectValue placeholder="Select action" />
            )}
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {ACTION_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  {Icon && <Icon className="size-4" />}
                  {option.label}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </FormItem>
  );

  const actionFields = renderOrgActionFields({ index, type, register });
  const delayControls = delayEnabled ? (
    <div className="flex items-center space-x-2">
      <span className="text-muted-foreground">after</span>
      <DelayInputControls
        name={`org-delay-${index}`}
        value={delayValue}
        onChange={(minutes) =>
          setValue(`actions.${index}.delayInMinutes`, minutes, {
            shouldValidate: true,
          })
        }
      />
    </div>
  ) : null;

  const rightContent =
    actionFields || delayControls ? (
      <Card className="space-y-4 p-4">
        {actionFields}
        {delayControls}
      </Card>
    ) : null;

  return (
    <RuleStep
      onRemove={onRemove}
      removeAriaLabel="Remove action"
      leftContent={leftContent}
      rightContent={rightContent}
      onAddDelay={
        canDelay
          ? () =>
              setValue(`actions.${index}.delayInMinutes`, 60, {
                shouldValidate: true,
              })
          : undefined
      }
      onRemoveDelay={
        canDelay
          ? () =>
              setValue(`actions.${index}.delayInMinutes`, null, {
                shouldValidate: true,
              })
          : undefined
      }
      hasDelay={delayEnabled}
    />
  );
}

function renderOrgActionFields({
  index,
  type,
  register,
}: {
  index: number;
  type: ActionType;
  register: UseFormRegister<OrgRuleFormValues>;
}) {
  const isSend = type === ActionType.SEND_EMAIL;
  const isReply = type === ActionType.REPLY;
  const isForward = type === ActionType.FORWARD;
  const hasRecipients = isSend || isReply || isForward;

  const rows: React.ReactNode[] = [];

  if (type === ActionType.LABEL) {
    rows.push(
      <Input
        key="label"
        type="text"
        name={`actions.${index}.label`}
        label="Label name"
        registerProps={register(`actions.${index}.label`)}
        placeholder="e.g. Invoices"
      />,
    );
  }

  if (type === ActionType.MOVE_FOLDER) {
    rows.push(
      <Input
        key="folderName"
        type="text"
        name={`actions.${index}.folderName`}
        label="Folder name"
        registerProps={register(`actions.${index}.folderName`)}
      />,
    );
  }

  if (type === ActionType.CALL_WEBHOOK) {
    rows.push(
      <Input
        key="url"
        type="text"
        name={`actions.${index}.url`}
        label="Webhook URL"
        registerProps={register(`actions.${index}.url`)}
      />,
    );
  }

  if (isSend || isForward) {
    rows.push(
      <Input
        key="to"
        type="text"
        name={`actions.${index}.to`}
        label={isForward ? "Forward to" : "To"}
        registerProps={register(`actions.${index}.to`)}
      />,
    );
  }

  if (isSend || isReply) {
    rows.push(
      <Input
        key="subject"
        type="text"
        name={`actions.${index}.subject`}
        label="Subject"
        registerProps={register(`actions.${index}.subject`)}
      />,
    );
  }

  if (isSend || isReply || type === ActionType.DRAFT_EMAIL) {
    rows.push(
      <Input
        key="content"
        type="text"
        as="textarea"
        autosizeTextarea
        rows={2}
        name={`actions.${index}.content`}
        label={
          type === ActionType.DRAFT_EMAIL
            ? "Draft content (optional)"
            : "Content"
        }
        registerProps={register(`actions.${index}.content`)}
      />,
    );
  }

  if (hasRecipients) {
    rows.push(
      <div key="cc-bcc" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          type="text"
          name={`actions.${index}.cc`}
          label="CC (optional)"
          registerProps={register(`actions.${index}.cc`)}
        />
        <Input
          type="text"
          name={`actions.${index}.bcc`}
          label="BCC (optional)"
          registerProps={register(`actions.${index}.bcc`)}
        />
      </div>,
    );
  }

  if (rows.length === 0) return null;

  return <div className="space-y-3">{rows}</div>;
}
