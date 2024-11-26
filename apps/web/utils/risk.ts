import type { RulesResponse } from "@/app/api/user/rules/route";
import { RuleType } from "@prisma/client";

export type RiskLevel = "low" | "medium" | "high" | "very-high";

export function getRiskLevel(
  rule: Pick<RulesResponse[number], "actions" | "automate" | "type">,
): {
  level: RiskLevel;
  message: string;
} {
  const hasAiGeneratedContent = rule.actions.some(isAiGeneratedContent);
  const hasAiGeneratedTo = rule.actions.some(isAiGeneratedTo);

  if (hasAiGeneratedContent && hasAiGeneratedTo && rule.automate) {
    const level = rule.type === RuleType.AI ? "very-high" : "high";

    return {
      level,
      message: `${
        level === "very-high" ? "Very High Risk" : "High Risk"
      }: The AI can generate content and send it to any address. A malicious actor could trick the AI to send spam or other unwanted emails on your behalf. Note: for any given email, the AI only has information to your rules and the content of the email it is replying to.`,
    };
  }

  if (hasAiGeneratedTo && rule.automate) {
    return {
      level: "high",
      message:
        "High Risk: The AI can send emails to any address. A malicious actor could use this to send spam or other unwanted emails on your behalf.",
    };
  }

  if (hasAiGeneratedContent && rule.automate) {
    return {
      level: "medium",
      message:
        "Medium Risk: The AI can automatically generate and send email content. A malicious actor could potentially trick the AI into generating unwanted or inappropriate content in your emails.",
    };
  }

  if ((hasAiGeneratedContent || hasAiGeneratedTo) && !rule.automate) {
    return {
      level: "medium",
      message:
        "Medium Risk: The AI can generate content or recipients, but requires manual approval. Review the AI's suggestions carefully before approving.",
    };
  }

  return { level: "low", message: "" };
}

function isAiGeneratedContent(
  action: Pick<
    RulesResponse[number]["actions"][number],
    "subjectPrompt" | "contentPrompt"
  >,
) {
  return (
    typeof action.subjectPrompt === "string" ||
    typeof action.contentPrompt === "string"
  );
}

function isAiGeneratedTo(
  action: Pick<
    RulesResponse[number]["actions"][number],
    "toPrompt" | "ccPrompt" | "bccPrompt"
  >,
) {
  return (
    typeof action.toPrompt === "string" ||
    typeof action.ccPrompt === "string" ||
    typeof action.bccPrompt === "string"
  );
}
