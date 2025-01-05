import { Provider } from "@/utils/llms/config";
import { saveUsage } from "@/utils/redis/usage";
import { publishAiCall } from "@inboxzero/tinybird-ai-analytics";

export async function saveAiUsage({
  email,
  provider,
  model,
  usage,
  label,
}: {
  email: string;
  provider: string | null;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  label: string;
}) {
  const cost = calcuateCost(model, usage);

  return Promise.all([
    publishAiCall({
      userId: email,
      provider: provider || Provider.ANTHROPIC,
      totalTokens: usage.totalTokens,
      completionTokens: usage.completionTokens,
      promptTokens: usage.promptTokens,
      cost,
      model,
      timestamp: Date.now(),
      label,
    }),
    saveUsage({ email, cost, usage }),
  ]);
}

const costs: Record<
  string,
  {
    input: number;
    output: number;
  }
> = {
  // https://openai.com/pricing
  "gpt-3.5-turbo-0125": {
    input: 0.5 / 1_000_000,
    output: 1.5 / 1_000_000,
  },
  "gpt-4o-mini": {
    input: 0.15 / 1_000_000,
    output: 0.6 / 1_000_000,
  },
  "gpt-4-turbo": {
    input: 10 / 1_000_000,
    output: 30 / 1_000_000,
  },
  "gpt-4o": {
    input: 5 / 1_000_000,
    output: 15 / 1_000_000,
  },
  // https://www.anthropic.com/pricing#anthropic-api
  "claude-3-5-sonnet-20240620": {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
  },
  // https://aws.amazon.com/bedrock/pricing/
  "anthropic.claude-3-5-sonnet-20240620-v1:0": {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
  },
  "anthropic.claude-3-5-sonnet-20241022-v2:0": {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
  },
  "us.anthropic.claude-3-5-sonnet-20241022-v2:0": {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
  },
  "anthropic.claude-3-5-haiku-20241022-v1:0": {
    input: 0.8 / 1_000_000,
    output: 4 / 1_000_000,
  },
  "us.anthropic.claude-3-5-haiku-20241022-v1:0": {
    input: 0.8 / 1_000_000,
    output: 4 / 1_000_000,
  },
};

// returns cost in cents
function calcuateCost(
  model: string,
  usage: {
    promptTokens: number;
    completionTokens: number;
  },
): number {
  if (!costs[model]) return 0;

  const { input, output } = costs[model];

  return usage.promptTokens * input + usage.completionTokens * output;
}
