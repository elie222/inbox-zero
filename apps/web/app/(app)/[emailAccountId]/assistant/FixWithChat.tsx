import { MessageCircleIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ParsedMessage } from "@/utils/types";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { truncate } from "@/utils/string";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingContent } from "@/components/LoadingContent";
import { useRules } from "@/hooks/useRules";
import { useModal } from "@/hooks/useModal";
import { NEW_RULE_ID } from "@/app/(app)/[emailAccountId]/assistant/consts";
import { Label } from "@/components/Input";
import { ButtonList } from "@/components/ButtonList";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { ProcessResultDisplay } from "@/app/(app)/[emailAccountId]/assistant/ProcessResultDisplay";
import { NONE_RULE_ID } from "@/app/(app)/[emailAccountId]/assistant/consts";
import { useSidebar } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function FixWithChat({
  setInput,
  message,
  result,
}: {
  setInput: (input: string) => void;
  message: ParsedMessage;
  result: RunRulesResult | null;
}) {
  const { data, isLoading, error } = useRules();
  const { isModalOpen, setIsModalOpen } = useModal();
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);

  const { setOpen } = useSidebar();

  const handleRuleSelect = (ruleId: string | null) => {
    setSelectedRuleId(ruleId);
    setShowExplanation(true);
  };

  const handleSubmit = () => {
    if (!selectedRuleId) return;

    let input: string;
    if (selectedRuleId === NEW_RULE_ID) {
      input = getFixMessage({
        message,
        result,
        expectedRuleName: NEW_RULE_ID,
        explanation,
      });
    } else {
      const expectedRule = data?.find((rule) => rule.id === selectedRuleId);

      input = getFixMessage({
        message,
        result,
        expectedRuleName: expectedRule?.name ?? null,
        explanation,
      });
    }

    setInput(input);
    setOpen((arr) => [...arr, "chat-sidebar"]);
    setIsModalOpen(false);

    // Reset state
    setSelectedRuleId(null);
    setExplanation("");
    setShowExplanation(false);
  };

  const handleClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      // Reset state when closing
      setSelectedRuleId(null);
      setExplanation("");
      setShowExplanation(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MessageCircleIcon className="mr-2 size-4" />
          Fix
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Improve Rules</DialogTitle>
        </DialogHeader>

        <LoadingContent loading={isLoading} error={error}>
          {data && !showExplanation ? (
            <RuleMismatch
              result={result}
              rules={data}
              onSelectExpectedRuleId={handleRuleSelect}
            />
          ) : data && showExplanation ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Selected rule:</span>
                <Badge variant="secondary">
                  {selectedRuleId === NEW_RULE_ID
                    ? "✨ New rule"
                    : selectedRuleId === NONE_RULE_ID
                      ? "❌ None"
                      : data.find((r) => r.id === selectedRuleId)?.name ||
                        "Unknown"}
                </Badge>
              </div>

              <div>
                <Label
                  name="explanation"
                  label="Why should this rule have been applied? (optional)"
                />
                <Textarea
                  id="explanation"
                  name="explanation"
                  className="mt-1"
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  aria-describedby="explanation-help"
                  autoFocus
                />
                <p id="explanation-help" className="mt-1 text-xs text-gray-500">
                  Providing an explanation helps the AI understand your intent
                  better
                </p>
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowExplanation(false);
                    setSelectedRuleId(null);
                    setExplanation("");
                  }}
                >
                  Back
                </Button>
                <Button onClick={handleSubmit}>Next</Button>
              </div>
            </div>
          ) : null}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}

function getFixMessage({
  message,
  result,
  expectedRuleName,
  explanation,
}: {
  message: ParsedMessage;
  result: RunRulesResult | null;
  expectedRuleName: string | null;
  explanation?: string;
}) {
  // Truncate content if it's too long
  // TODO: HTML text / text plain
  const getMessageContent = () => {
    const content = message.snippet || message.textPlain || "";
    return truncate(content, 500).trim();
  };

  return `You applied the wrong rule to this email.
Fix our rules so this type of email is handled correctly in the future.

Email details:
*From*: ${message.headers.from}
*Subject*: ${message.headers.subject}
*Content*: ${getMessageContent()}

Current rule applied: ${result?.rule?.name || "No rule"}

Reason the rule was chosen:
${result?.reason || "-"}

${
  expectedRuleName === NEW_RULE_ID
    ? "I'd like to create a new rule to handle this type of email."
    : expectedRuleName
      ? `The rule that should have been applied was: "${expectedRuleName}"`
      : "Instead, no rule should have been applied."
}${explanation ? `\n\nExplanation: ${explanation}` : ""}`.trim();
}

function RuleMismatch({
  result,
  rules,
  onSelectExpectedRuleId,
}: {
  result: RunRulesResult | null;
  rules: RulesResponse;
  onSelectExpectedRuleId: (ruleId: string | null) => void;
}) {
  return (
    <div>
      <Label name="matchedRule" label="Matched:" />
      <div className="mt-1">
        {result ? (
          <ProcessResultDisplay result={result} />
        ) : (
          <p>No rule matched</p>
        )}
      </div>
      <div className="mt-4">
        <ButtonList
          title="Which rule did you expect it to match?"
          emptyMessage="You haven't created any rules yet!"
          items={[
            { id: NONE_RULE_ID, name: "❌ None" },
            { id: NEW_RULE_ID, name: "✨ New rule" },
            ...rules,
          ]}
          onSelect={onSelectExpectedRuleId}
        />
      </div>
    </div>
  );
}
