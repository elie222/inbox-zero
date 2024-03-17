export type UserAIFields = {
  aiProvider: "openai" | "anthropic" | null;
  aiModel: string | null;
  openAIApiKey: string | null;
};
