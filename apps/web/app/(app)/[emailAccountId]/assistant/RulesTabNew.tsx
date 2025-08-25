import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPromptNew";

export function RulesTab() {
  return (
    <div>
      <RulesPrompt />

      <h3 className="font-cal text-xl leading-7 mt-8 mb-2">Rules</h3>
      <Rules showAddRuleButton={false} />
    </div>
  );
}
