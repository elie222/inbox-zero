import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { AddRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/AddRuleDialog";
import { MutedText } from "@/components/Typography";
import { BulkRunRules } from "@/app/(app)/[emailAccountId]/assistant/BulkRunRules";

export function RulesTab() {
  return (
    <div>
      <div className="flex items-center mb-2 justify-between">
        <MutedText>
          Your assistant automatically organizes incoming emails using these
          rules.
        </MutedText>

        <div className="flex items-center gap-2">
          <BulkRunRules />
          <AddRuleDialog />
        </div>
      </div>
      <Rules showAddRuleButton={false} />
    </div>
  );
}
