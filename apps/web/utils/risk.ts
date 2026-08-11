import type { RulesResponse } from "@/app/api/user/rules/route";
import type { Prisma } from "@/generated/prisma/client";
import { isAIRule, type RuleConditions } from "@/utils/condition";
import { ActionType } from "@/generated/prisma/enums";
import { TEMPLATE_VARIABLE_PATTERN } from "@/utils/template";
import {
  getIntegrationToolSpec,
  isAiFilledArgValue,
} from "@/utils/mcp/tool-specs";

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
  integrationName?: string | null;
  integrationToolName?: string | null;
  integrationArgs?: Prisma.JsonValue | null;
};

export function getActionRiskLevel(
  action: RiskAction,
  rule: RuleConditions,
): {
  level: RiskLevel;
  message: string;
} {
  const highRiskActions = [
    ActionType.REPLY,
    ActionType.FORWARD,
    ActionType.SEND_EMAIL,
    ActionType.INTEGRATION,
  ];
  if (!highRiskActions.some((type) => type === action.type)) {
    return {
      level: RISK_LEVELS.LOW,
      message: "Low Risk: No email sending action is performed.",
    };
  }

  const fieldStatus = getFieldsDynamicStatus(action);

  const contentFields = [
    fieldStatus.subject,
    fieldStatus.content,
    fieldStatus.integrationArgs,
  ];
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

  // All rules are now automated, so we always check for dynamic content risks
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
    if (action.type === ActionType.INTEGRATION) {
      return {
        level: RISK_LEVELS.HIGH,
        message:
          "High Risk: The AI can generate any task content from the matching email. A malicious sender could trick the AI into creating unwanted or misleading tasks in your connected integration.",
      };
    }
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
  rule: Pick<RulesResponse[number], "actions"> & RuleConditions,
): {
  level: RiskLevel;
  message: string;
} {
  // Get risk level for each action and return the highest risk
  return rule.actions.reduce<{ level: RiskLevel; message: string }>(
    (highestRisk, action) => {
      const actionRisk = getActionRiskLevel(action, rule);
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
  return {
    subject: checkFieldStatus(action.subject),
    content: checkFieldStatus(action.content),
    to: checkFieldStatus(action.to),
    cc: checkFieldStatus(action.cc),
    bcc: checkFieldStatus(action.bcc),
    integrationArgs: getIntegrationArgsDynamicStatus(action),
  };
}

function checkFieldStatus(field: string | null) {
  if (!field) return null;
  if (isFullyDynamicField(field)) return "fully-dynamic";
  if (isPartiallyDynamicField(field)) return "partially-dynamic";
  return "static";
}

function getIntegrationArgsDynamicStatus(action: RiskAction) {
  if (action.type !== ActionType.INTEGRATION) return null;

  const spec = getIntegrationToolSpec(
    action.integrationName,
    action.integrationToolName,
  );
  // Fail safe: an unrecognised tool is assumed to write AI-generated content,
  // so it still trips the high-risk gate instead of looking static.
  if (!spec) return "fully-dynamic";

  const integrationArgs =
    action.integrationArgs &&
    typeof action.integrationArgs === "object" &&
    !Array.isArray(action.integrationArgs)
      ? (action.integrationArgs as Record<string, unknown>)
      : {};

  const statuses = spec.args.map((arg) => {
    const rawValue = integrationArgs[arg.key];
    const value = typeof rawValue === "string" ? rawValue : "";
    // An arg the AI fills at execution is as dynamic as a {{template}} was,
    // even though it is stored empty.
    if (isAiFilledArgValue(arg, value)) return "fully-dynamic";
    return checkFieldStatus(value);
  });

  if (statuses.includes("fully-dynamic")) return "fully-dynamic";
  if (statuses.includes("partially-dynamic")) return "partially-dynamic";
  if (statuses.includes("static")) return "static";
  return null;
}

// Helper functions
export function isFullyDynamicField(field: string) {
  const trimmed = field.trim();
  return trimmed.startsWith("{{") && trimmed.endsWith("}}");
}

export function isPartiallyDynamicField(field: string) {
  return new RegExp(TEMPLATE_VARIABLE_PATTERN).test(field);
}
