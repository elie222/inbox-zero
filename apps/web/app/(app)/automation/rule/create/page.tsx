import { RuleForm } from "@/app/(app)/automation/RuleForm";
import { examples } from "@/app/(app)/automation/create/examples";
import type { RuleType } from "@prisma/client";

export default async function CreateRulePage(props: {
  searchParams: Promise<{ example?: string; groupId?: string; tab?: RuleType }>;
}) {
  const searchParams = await props.searchParams;
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
            type: searchParams.tab || "AI",
            groupId: searchParams.groupId,
          }
        }
      />
    </div>
  );
}
