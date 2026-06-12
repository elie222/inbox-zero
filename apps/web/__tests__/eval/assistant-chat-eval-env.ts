/** Shared `@/env` mock values for assistant-chat eval suites. */
export function buildAssistantChatEvalEnv(
  overrides: Record<string, unknown> = {},
) {
  return {
    AZURE_FOUNDRY_API_KEY: process.env.AZURE_FOUNDRY_API_KEY,
    AZURE_FOUNDRY_BASE_URL: process.env.AZURE_FOUNDRY_BASE_URL,
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    ...overrides,
  };
}
