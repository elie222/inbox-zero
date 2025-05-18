import { HammerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SetInputFunction } from "@/components/assistant-chat/types";
import type { ParsedMessage } from "@/utils/types";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { truncate } from "@/utils/string";

export function FixWithChat({
  setInput,
  message,
  result,
}: {
  setInput: SetInputFunction;
  message: ParsedMessage;
  result: RunRulesResult | null;
}) {
  // Truncate content if it's too long
  // TODO: HTML text / text plain
  const getMessageContent = () => {
    const content = message.snippet || message.textPlain || "";
    return truncate(content, 500);
  };

  return (
    <Button
      variant="outline"
      onClick={() =>
        setInput(
          `You applied the wrong rule to this email.
Fix our rules so this type of email is handled correctly in the future.

Email details:
- From: ${message.headers.from}
- Subject: ${message.headers.subject}
- Content: ${getMessageContent()}

Current rule applied: ${result?.rule?.name || "No rule"}
${result?.rule?.instructions ? `Rule instructions: ${result.rule.instructions}` : ""}

Reason the rule was chosen:
${result?.reason || "-"}

Modify our rules to ensure this type of email is processed correctly.`,
        )
      }
    >
      <HammerIcon className="mr-2 size-4" />
      Fix in chat
    </Button>
  );
}
