import type {
  Control,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { ActionType } from "@/generated/prisma/enums";
import { RuleSteps } from "@/app/(app)/[emailAccountId]/assistant/RuleSteps";
import type { EmailLabel } from "@/providers/EmailProvider";
import type { OutlookFolder } from "@/utils/outlook/folders";
import { ActionCard } from "@/app/(app)/[emailAccountId]/assistant/RuleForm";

export function ActionSteps({
  actionFields,
  register,
  watch,
  setValue,
  control,
  errors,
  userLabels,
  isLoading,
  mutate,
  emailAccountId,
  remove,
  typeOptions,
  folders,
  foldersLoading,
  append,
}: {
  actionFields: Array<{ id: string } & CreateRuleBody["actions"][number]>;
  register: UseFormRegister<CreateRuleBody>;
  watch: UseFormWatch<CreateRuleBody>;
  setValue: UseFormSetValue<CreateRuleBody>;
  control: Control<CreateRuleBody>;
  errors: FieldErrors<CreateRuleBody>;
  userLabels: EmailLabel[];
  isLoading: boolean;
  mutate: () => Promise<unknown>;
  emailAccountId: string;
  remove: (index: number) => void;
  typeOptions: { label: string; value: ActionType; icon: React.ElementType }[];
  folders: OutlookFolder[];
  foldersLoading: boolean;
  append: (action: CreateRuleBody["actions"][number]) => void;
}) {
  return (
    <RuleSteps
      onAdd={() => append({ type: ActionType.LABEL })}
      addButtonLabel="Add Action"
      addButtonDisabled={false}
    >
      {actionFields?.map((field, i) => (
        <ActionCard
          key={field.id}
          action={field}
          index={i}
          register={register}
          watch={watch}
          setValue={setValue}
          control={control}
          errors={errors}
          userLabels={userLabels}
          isLoading={isLoading}
          mutate={mutate}
          emailAccountId={emailAccountId}
          remove={remove}
          typeOptions={typeOptions}
          folders={folders}
          foldersLoading={foldersLoading}
        />
      ))}
    </RuleSteps>
  );
}
