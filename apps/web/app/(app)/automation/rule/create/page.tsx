import { RuleForm } from "@/app/(app)/automation/RuleForm";
import { examples } from "@/app/(app)/automation/create/examples";

export default function CreateRulePage({
  searchParams,
}: {
  searchParams: { example: string };
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
            type: "AI",
          }
        }
      />
    </div>
  );
}
