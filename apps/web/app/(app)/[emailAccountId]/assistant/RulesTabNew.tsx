import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { AddRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/AddRuleDialog";

export function RulesTab() {
  return (
    <div>
      <div className="flex items-center mb-2 justify-end">
        <AddRuleDialog />
      </div>
      <Rules showAddRuleButton={false} />
    </div>
  );
}
