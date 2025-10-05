import { RuleForm } from "@/app/(app)/[emailAccountId]/assistant/RuleForm";
import { examples } from "@/app/(app)/[emailAccountId]/assistant/create/examples";
import { getEmptyCondition } from "@/utils/condition";
import { ActionType } from "@prisma/client";
import type { CoreConditionType } from "@/utils/config";

export default async function CreateRulePage(props: {
  searchParams: Promise<{
    example?: string;
    groupId?: string;
    type?: CoreConditionType;
    categoryId?: string;
    label?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const rule =
    searchParams.example &&
    examples[Number.parseInt(searchParams.example)].rule;

  return (
    <div className="content-container">
      <RuleForm
        rule={
          rule || {
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
              ? [getEmptyCondition(searchParams.type, searchParams.categoryId)]
              : [],
            runOnThreads: true,
          }
        }
        alwaysEditMode
      />
    </div>
  );
}
