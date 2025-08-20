export const AI_GENERATED_FIELD_VALUE = "___AI_GENERATE___";

export const EMAIL_ACCOUNT_HEADER = "X-Email-Account-ID";

export const NO_REFRESH_TOKEN_ERROR_CODE = "NO_REFRESH_TOKEN";

export const userCount = "15,000+";

export const KNOWLEDGE_BASIC_MAX_ITEMS = 1;
export const KNOWLEDGE_BASIC_MAX_CHARS = 2000;

export const ConditionType = {
  AI: "AI",
  STATIC: "STATIC",
  GROUP: "GROUP",
  CATEGORY: "CATEGORY",
  PRESET: "PRESET",
} as const;

export type ConditionType = (typeof ConditionType)[keyof typeof ConditionType];
export type CoreConditionType = Exclude<ConditionType, "GROUP" | "PRESET">;

export const WELCOME_PATH = "/welcome-redirect";

export const EXTENSION_URL = "https://go.getinboxzero.com/extension";
