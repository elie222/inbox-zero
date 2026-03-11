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

export const API_KEY_SCOPE_OPTIONS: Array<{
  value: ApiKeyScopeValue;
  label: string;
  description: string;
}> = [
  {
    value: "RULES_READ",
    label: "Read rules",
    description: "List and inspect automation rules for this inbox.",
  },
  {
    value: "RULES_WRITE",
    label: "Write rules",
    description: "Create, update, and delete automation rules for this inbox.",
  },
  {
    value: "STATS_READ",
    label: "Read stats",
    description: "Read aggregated inbox statistics for this inbox.",
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
  return (
    API_KEY_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ??
    scope
  );
}
