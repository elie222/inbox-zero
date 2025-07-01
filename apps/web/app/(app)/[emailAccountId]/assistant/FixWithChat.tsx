import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { MessageCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SetInputFunction } from "@/components/assistant-chat/types";
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
import { useAccount } from "@/providers/EmailAccountProvider";
import { useModal } from "@/hooks/useModal";
import { NEW_RULE_ID } from "@/app/(app)/[emailAccountId]/assistant/consts";
import { useAssistantNavigation } from "@/hooks/useAssistantNavigation";
import { Label } from "@/components/Input";
import { ButtonList } from "@/components/ButtonList";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { ProcessResultDisplay } from "@/app/(app)/[emailAccountId]/assistant/ProcessResultDisplay";
import { NONE_RULE_ID } from "@/app/(app)/[emailAccountId]/assistant/consts";

export function FixWithChat({
  setInput,
  message,
  result,
}: {
  setInput: SetInputFunction;
  message: ParsedMessage;
  result: RunRulesResult | null;
}) {
  const { data, isLoading, error } = useRules();
  const { emailAccountId } = useAccount();
  const { isModalOpen, setIsModalOpen } = useModal();
  const { createAssistantUrl } = useAssistantNavigation(emailAccountId);
  const router = useRouter();
  const [currentTab] = useQueryState("tab");

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
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
          {data && (
            <RuleMismatch
              emailAccountId={emailAccountId}
              result={result}
              rules={data}
              onSelectExpectedRuleId={(expectedRuleId) => {
                let input: string;

                if (expectedRuleId === NEW_RULE_ID) {
                  input = getFixMessage({
                    message,
                    result,
                    expectedRuleName: NEW_RULE_ID,
                  });
                } else {
                  const expectedRule = data.find(
                    (rule) => rule.id === expectedRuleId,
                  );

                  input = getFixMessage({
                    message,
                    result,
                    expectedRuleName: expectedRule?.name ?? null,
                  });
                }

                if (setInput) {
                  // this is only set if we're in the correct context
                  setInput(input);
                } else {
                  // redirect to the assistant page
                  const searchParams = new URLSearchParams();
                  searchParams.set("input", input);
                  if (currentTab) searchParams.set("tab", currentTab);

                  router.push(
                    createAssistantUrl({
                      input,
                      tab: currentTab || undefined,
                      path: `/assistant${searchParams.toString()}`,
                    }),
                  );
                }

                setIsModalOpen(false);
              }}
            />
          )}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}

function getFixMessage({
  message,
  result,
  expectedRuleName,
}: {
  message: ParsedMessage;
  result: RunRulesResult | null;
  expectedRuleName: string | null;
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
}
`.trim();
}

function RuleMismatch({
  result,
  rules,
  emailAccountId,
  onSelectExpectedRuleId,
}: {
  result: RunRulesResult | null;
  rules: RulesResponse;
  emailAccountId: string;
  onSelectExpectedRuleId: (ruleId: string | null) => void;
}) {
  return (
    <div>
      <Label name="matchedRule" label="Matched:" />
      <div className="mt-1">
        {result ? (
          <ProcessResultDisplay
            result={result}
            emailAccountId={emailAccountId}
          />
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
