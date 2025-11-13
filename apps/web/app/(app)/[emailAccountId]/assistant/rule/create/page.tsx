import { RuleForm } from "@/app/(app)/[emailAccountId]/assistant/RuleForm";
import { getEmptyCondition } from "@/utils/condition";
import { ActionType } from "@prisma/client";
import type { CoreConditionType } from "@/utils/config";

export default async function CreateRulePage(props: {
  searchParams: Promise<{
    groupId?: string;
    type?: CoreConditionType;
    label?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="content-container">
      <RuleForm
        rule={{
          name: searchParams.label ? `Label ${searchParams.label}` : "",
          actions: searchParams.label
            ? [
                {
                  type: ActionType.LABEL,
                  labelId: { name: searchParams.label },
                },
              ]
            : [],
          conditions: searchParams.type
            ? [getEmptyCondition(searchParams.type)]
            : [],
          runOnThreads: true,
        }}
        alwaysEditMode
      />
    </div>
  );
}
