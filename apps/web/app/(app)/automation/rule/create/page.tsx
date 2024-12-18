import { RuleForm } from "@/app/(app)/automation/RuleForm";
import { examples } from "@/app/(app)/automation/create/examples";
import { getConditions } from "@/utils/condition";
import type { RuleType } from "@prisma/client";

export default function CreateRulePage({
  searchParams,
}: {
  searchParams: { example?: string; groupId?: string; tab?: RuleType };
}) {
  const rule =
    searchParams.example &&
    examples[Number.parseInt(searchParams.example)].rule;

  return (
    <div className="content-container mx-auto w-full max-w-3xl">
      <RuleForm
        rule={
          rule || {
            name: "",
            actions: [],
            conditions: getConditions({
              type: searchParams.tab,
              groupId: searchParams.groupId,
            }),
          }
        }
      />
    </div>
  );
}
