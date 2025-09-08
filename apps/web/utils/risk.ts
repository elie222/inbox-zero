import type { RulesResponse } from "@/app/api/user/rules/route";
import { isAIRule, type RuleConditions } from "@/utils/condition";
import { ActionType } from "@prisma/client";
import { TEMPLATE_VARIABLE_PATTERN } from "@/utils/template";

const RISK_LEVELS = {
  VERY_HIGH: "very-high",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type RiskLevel = (typeof RISK_LEVELS)[keyof typeof RISK_LEVELS];

export type RiskAction = {
  type: ActionType;
  subject: string | null;
  content: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
};

export function getActionRiskLevel(
  action: RiskAction,
  isAutomated: boolean,
  rule: RuleConditions,
): {
  level: RiskLevel;
  message: string;
} {
  const highRiskActions = [
    ActionType.REPLY,
    ActionType.FORWARD,
    ActionType.SEND_EMAIL,
  ];
  if (!highRiskActions.some((type) => type === action.type)) {
    return {
      level: RISK_LEVELS.LOW,
      message:
        "Low Risk: No email sending action is performed without your review.",
    };
  }

  const fieldStatus = getFieldsDynamicStatus(action);

  const contentFields = [fieldStatus.subject, fieldStatus.content];
  const recipientFields = [fieldStatus.to, fieldStatus.cc, fieldStatus.bcc];

  const hasFullyDynamicContent = hasAnyFieldWithStatus(
    contentFields,
    "fully-dynamic",
  );
  const hasPartiallyDynamicContent = hasAnyFieldWithStatus(
    contentFields,
    "partially-dynamic",
  );

  const hasFullyDynamicRecipient = hasAnyFieldWithStatus(
    recipientFields,
    "fully-dynamic",
  );
  const hasPartiallyDynamicRecipient = hasAnyFieldWithStatus(
    recipientFields,
    "partially-dynamic",
  );

  if (isAutomated) {
    if (hasFullyDynamicContent && hasFullyDynamicRecipient) {
      const level = isAIRule(rule) ? RISK_LEVELS.VERY_HIGH : RISK_LEVELS.HIGH;
      return {
        level,
        message: `${level === RISK_LEVELS.VERY_HIGH ? "Very High" : "High"} Risk: The AI can generate any content and send it to any address. A malicious actor could trick the AI to send spam or other unwanted emails on your behalf.`,
      };
    }

    if (hasFullyDynamicRecipient) {
      return {
        level: RISK_LEVELS.HIGH,
        message:
          "High Risk: The AI can send emails to any address. A malicious actor could use this to send spam or other unwanted emails on your behalf.",
      };
    }

    if (hasFullyDynamicContent) {
      return {
        level: RISK_LEVELS.HIGH,
        message:
          "High Risk: The AI can automatically generate and send any email content. A malicious actor could potentially trick the AI into generating unwanted or inappropriate content.",
      };
    }

    if (hasPartiallyDynamicContent || hasPartiallyDynamicRecipient) {
      return {
        level: RISK_LEVELS.MEDIUM,
        message:
          "Medium Risk: The AI can generate content or recipients using templates. While more constrained than fully dynamic content, review the templates carefully.",
      };
    }
  }

  return {
    level: RISK_LEVELS.LOW,
    message: "Low Risk: All content and recipients are static.",
  };
}

function hasAnyFieldWithStatus(
  fields: (string | null)[],
  status: "fully-dynamic" | "partially-dynamic",
) {
  return fields.some((field) => field === status);
}

function compareRiskLevels(a: RiskLevel, b: RiskLevel): RiskLevel {
  const riskOrder: Record<RiskLevel, number> = {
    [RISK_LEVELS.VERY_HIGH]: 4,
    [RISK_LEVELS.HIGH]: 3,
    [RISK_LEVELS.MEDIUM]: 2,
    [RISK_LEVELS.LOW]: 1,
  };
  return riskOrder[a] >= riskOrder[b] ? a : b;
}

export function getRiskLevel(
  rule: Pick<RulesResponse[number], "actions" | "automate"> & RuleConditions,
): {
  level: RiskLevel;
  message: string;
} {
  // Get risk level for each action and return the highest risk
  return rule.actions.reduce<{ level: RiskLevel; message: string }>(
    (highestRisk, action) => {
      const actionRisk = getActionRiskLevel(action, rule.automate, rule);
      if (
        compareRiskLevels(actionRisk.level, highestRisk.level) ===
        actionRisk.level
      ) {
        return actionRisk;
      }
      return highestRisk;
    },
    {
      level: RISK_LEVELS.LOW,
      message: "Low Risk: All content and recipients are static.",
    },
  );
}

function getFieldsDynamicStatus(action: RiskAction) {
  const checkFieldStatus = (field: string | null) => {
    if (!field) return null;
    if (isFullyDynamicField(field)) return "fully-dynamic";
    if (isPartiallyDynamicField(field)) return "partially-dynamic";
    return "static";
  };

  return {
    subject: checkFieldStatus(action.subject),
    content: checkFieldStatus(action.content),
    to: checkFieldStatus(action.to),
    cc: checkFieldStatus(action.cc),
    bcc: checkFieldStatus(action.bcc),
  };
}

// Helper functions
export function isFullyDynamicField(field: string) {
  const trimmed = field.trim();
  return trimmed.startsWith("{{") && trimmed.endsWith("}}");
}

export function isPartiallyDynamicField(field: string) {
  return new RegExp(TEMPLATE_VARIABLE_PATTERN).test(field);
}
