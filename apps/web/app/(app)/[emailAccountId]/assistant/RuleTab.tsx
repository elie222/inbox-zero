"use client";

import { useQueryState } from "nuqs";
import { Rule } from "@/app/(app)/[emailAccountId]/assistant/RuleForm";
import { MessageText } from "@/components/Typography";

export function RuleTab() {
  const [ruleId] = useQueryState("ruleId");

  if (!ruleId)
    return (
      <div className="p-4">
        <MessageText>No rule selected</MessageText>
      </div>
    );

  return <Rule ruleId={ruleId} />;
}
