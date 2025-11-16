import { MessageCircleIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ParsedMessage } from "@/utils/types";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
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
import { ResultsDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import { NONE_RULE_ID } from "@/app/(app)/[emailAccountId]/assistant/consts";
import { useSidebar } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/providers/ChatProvider";
import {
  NEW_RULE_ID as CONST_NEW_RULE_ID,
  NONE_RULE_ID as CONST_NONE_RULE_ID,
} from "@/app/(app)/[emailAccountId]/assistant/consts";
import type { MessageContext } from "@/app/api/chat/validation";

export function FixWithChat({
  setInput,
  message,
  results,
}: {
  setInput: (input: string) => void;
  message: ParsedMessage;
  results: RunRulesResult[];
}) {
  const { data, isLoading, error } = useRules();
  const { isModalOpen, setIsModalOpen } = useModal();
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);

  const { setOpen } = useSidebar();
  const { setContext } = useChat();

  const selectedRuleName = useMemo(() => {
    if (!data) return null;
    if (selectedRuleId === NEW_RULE_ID) return "New rule";
    if (selectedRuleId === NONE_RULE_ID) return "None";
    return data.find((r) => r.id === selectedRuleId)?.name ?? null;
  }, [data, selectedRuleId]);

  const handleRuleSelect = (ruleId: string | null) => {
    setSelectedRuleId(ruleId);
    setShowExplanation(true);
  };

  const handleSubmit = () => {
    if (!selectedRuleId) return;

    let input: string;

    if (selectedRuleId === CONST_NEW_RULE_ID) {
      input = explanation?.trim()
        ? `Create a new rule for emails like this: ${explanation.trim()}`
        : "Create a new rule for emails like this: ";
    } else if (selectedRuleId === CONST_NONE_RULE_ID) {
      input = explanation?.trim()
        ? `This email shouldn't have matched any rule because ${explanation.trim()}`
        : "This email shouldn't have matched any rule because ";
    } else {
      const rulePart = selectedRuleName
        ? `the "${selectedRuleName}" rule`
        : "a different rule";
      input = explanation?.trim()
        ? `This email should have matched ${rulePart} because ${explanation.trim()}`
        : `This email should have matched ${rulePart} because `;
    }

    const context: MessageContext = {
      type: "fix-rule",
      message: {
        id: message.id,
        threadId: message.threadId,
        snippet: message.snippet,
        textPlain: message.textPlain,
        textHtml: message.textHtml,
        headers: {
          from: message.headers.from,
          to: message.headers.to,
          subject: message.headers.subject,
          cc: message.headers.cc,
          date: message.headers.date,
          "reply-to": message.headers["reply-to"],
        },
        internalDate: message.internalDate,
      },
      results: results.map((r) => ({
        ruleName: r.rule?.name ?? null,
        reason: r.reason ?? "",
      })),
      expected:
        selectedRuleId === CONST_NEW_RULE_ID
          ? "new"
          : selectedRuleId === CONST_NONE_RULE_ID
            ? "none"
            : { name: selectedRuleName || "Unknown" },
    };
    setContext(context);

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
              results={results}
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

function RuleMismatch({
  results,
  rules,
  onSelectExpectedRuleId,
}: {
  results: RunRulesResult[];
  rules: RulesResponse;
  onSelectExpectedRuleId: (ruleId: string | null) => void;
}) {
  return (
    <div>
      <Label name="matchedRule" label="Matched:" />
      <div className="mt-1">
        {results.length > 0 ? (
          <ResultsDisplay results={results} />
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
