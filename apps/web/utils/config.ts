export const AI_GENERATED_FIELD_VALUE = "___AI_GENERATE___";

export const userCount = "10,000+";

export const RuleType = {
  AI: "AI",
  STATIC: "STATIC",
  GROUP: "GROUP",
  CATEGORY: "CATEGORY",
} as const;

export type RuleType = (typeof RuleType)[keyof typeof RuleType];
