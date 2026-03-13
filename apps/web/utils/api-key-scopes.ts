import { z } from "zod";

export const API_KEY_SCOPES = [
  "STATS_READ",
  "RULES_READ",
  "RULES_WRITE",
  "SETTINGS_READ",
  "SETTINGS_WRITE",
  "ASSISTANT_CHAT",
] as const;

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);
export type ApiKeyScopeValue = z.infer<typeof apiKeyScopeSchema>;

const API_KEY_SCOPE_METADATA: Record<
  ApiKeyScopeValue,
  {
    label: string;
    description: string;
  }
> = {
  STATS_READ: {
    label: "Read stats",
    description: "Read aggregated inbox statistics for this inbox.",
  },
  RULES_READ: {
    label: "Read rules",
    description: "List and inspect automation rules for this inbox.",
  },
  RULES_WRITE: {
    label: "Write rules",
    description: "Create, update, and delete automation rules for this inbox.",
  },
  SETTINGS_READ: {
    label: "Read settings",
    description: "Read inbox settings for this inbox.",
  },
  SETTINGS_WRITE: {
    label: "Write settings",
    description: "Update inbox settings for this inbox.",
  },
  ASSISTANT_CHAT: {
    label: "Assistant chat",
    description: "Start assistant chat sessions for this inbox.",
  },
};

export const API_KEY_SCOPE_OPTIONS: Array<{
  value: ApiKeyScopeValue;
  label: string;
  description: string;
}> = [
  {
    value: "RULES_READ",
    ...API_KEY_SCOPE_METADATA.RULES_READ,
  },
  {
    value: "RULES_WRITE",
    ...API_KEY_SCOPE_METADATA.RULES_WRITE,
  },
  {
    value: "STATS_READ",
    ...API_KEY_SCOPE_METADATA.STATS_READ,
  },
];

export const DEFAULT_API_KEY_SCOPES: ApiKeyScopeValue[] = [
  "RULES_READ",
  "RULES_WRITE",
  "STATS_READ",
];

export const API_KEY_EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "No expiry" },
] as const;

export const apiKeyExpirySchema = z.enum(
  API_KEY_EXPIRY_OPTIONS.map((option) => option.value) as [
    (typeof API_KEY_EXPIRY_OPTIONS)[number]["value"],
    ...(typeof API_KEY_EXPIRY_OPTIONS)[number]["value"][],
  ],
);

export type ApiKeyExpiryValue = z.infer<typeof apiKeyExpirySchema>;

export function formatApiKeyScope(scope: ApiKeyScopeValue): string {
  return API_KEY_SCOPE_METADATA[scope]?.label ?? scope;
}
