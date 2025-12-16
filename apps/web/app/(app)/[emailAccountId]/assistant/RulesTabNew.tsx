import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { AddRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/AddRuleDialog";

export function RulesTab() {
  return (
    <div>
      <div className="flex items-center mb-2 justify-between">
        <p className="text-sm text-muted-foreground">
          Your assistant automatically organizes incoming emails using these
          rules.
        </p>

        <AddRuleDialog />
      </div>
      <Rules showAddRuleButton={false} />
    </div>
  );
}
