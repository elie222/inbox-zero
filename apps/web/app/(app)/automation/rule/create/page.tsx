import { RuleForm } from "@/app/(app)/automation/RuleForm";
import { examples } from "@/app/(app)/automation/create/examples";
import { getEmptyCondition } from "@/utils/condition";
import { ActionType, type RuleType } from "@prisma/client";

export default function CreateRulePage({
  searchParams,
}: {
  searchParams: {
    example?: string;
    groupId?: string;
    type?: Exclude<RuleType, "GROUP">;
    categoryId?: string;
    label?: string;
  };
}) {
  const rule =
    searchParams.example &&
    examples[Number.parseInt(searchParams.example)].rule;

  return (
    <div className="content-container mx-auto w-full max-w-3xl">
      <RuleForm
        rule={
          rule || {
            name: searchParams.label ? `Label ${searchParams.label}` : "",
            actions: searchParams.label
              ? [
                  {
                    type: ActionType.LABEL,
                    label: { value: searchParams.label },
                  },
                ]
              : [],
            conditions: searchParams.type
              ? [getEmptyCondition(searchParams.type, searchParams.categoryId)]
              : [],
            automate: true,
          }
        }
      />
    </div>
  );
}
