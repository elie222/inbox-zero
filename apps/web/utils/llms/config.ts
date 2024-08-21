export const Provider = {
  OPEN_AI: "openai",
  ANTHROPIC: "anthropic",
};

export const providerOptions = [
  { label: "OpenAI", value: Provider.OPEN_AI },
  { label: "Anthropic", value: Provider.ANTHROPIC },
];

export const modelOptions: Record<string, { label: string; value: string }[]> =
  {
    [Provider.OPEN_AI]: [
      { label: "GPT-4o", value: "gpt-4o" },
      { label: "GPT-4o Mini", value: "gpt-4o-mini" },
    ],
    [Provider.ANTHROPIC]: [
      {
        label: "Claude 3.5 Sonnet",
        value: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      },
    ],
  };

export function getDefaultModel(provider: string) {
  const models = modelOptions[provider];
  if (models.length) throw new Error("No model found");
  return modelOptions[provider][0].value;
}
