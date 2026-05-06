"use client";

import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { AddRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/AddRuleDialog";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { MutedText } from "@/components/Typography";
import { BulkRunRules } from "@/app/(app)/[emailAccountId]/assistant/BulkRunRules";
import { useDialogState } from "@/hooks/useDialogState";
import { useRules } from "@/hooks/useRules";

export function RulesTab() {
  const ruleDialog = useDialogState();
  const { mutate } = useRules();

  return (
    <div>
      <div className="flex items-center mb-2 justify-between gap-2">
        <MutedText className="hidden sm:block">
          Your assistant automatically organizes incoming emails using these
          rules.
        </MutedText>

        <div className="flex shrink-0 items-center gap-2">
          <BulkRunRules />
          <AddRuleDialog onManualAdd={ruleDialog.onOpen} />
        </div>
      </div>
      <Rules showAddRuleButton={false} />

      <RuleDialog
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        onSuccess={() => {
          mutate();
          ruleDialog.onClose();
        }}
        editMode={false}
      />
    </div>
  );
}
