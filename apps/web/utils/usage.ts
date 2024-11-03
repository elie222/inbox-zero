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

const MILLION = 1_000_000;

const costs: Record<
  string,
  {
    input: number;
    output: number;
  }
> = {
  // https://openai.com/api/pricing/
  "gpt-3.5-turbo-0125": {
    input: 0.5 / MILLION,
    output: 1.5 / MILLION,
  },
  "gpt-4o-mini": {
    input: 0.15 / MILLION,
    output: 0.6 / MILLION,
  },
  "gpt-4-turbo": {
    input: 10 / MILLION,
    output: 30 / MILLION,
  },
  "gpt-4o": {
    input: 5 / MILLION,
    output: 15 / MILLION,
  },
  "o1-preview": {
    input: 15 / MILLION,
    output: 60 / MILLION,
  },
  "o1-preview-2024-09-12": {
    input: 15 / MILLION,
    output: 60 / MILLION,
  },
  "o1-mini": {
    input: 3 / MILLION,
    output: 12 / MILLION,
  },
  "o1-mini-2024-09-12": {
    input: 3 / MILLION,
    output: 12 / MILLION,
  },
  // https://www.anthropic.com/pricing#anthropic-api
  "claude-3-5-sonnet-20240620": {
    input: 3 / MILLION,
    output: 15 / MILLION,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3 / MILLION,
    output: 15 / MILLION,
  },
  // https://aws.amazon.com/bedrock/pricing/
  "anthropic.claude-3-5-sonnet-20240620-v1:0": {
    input: 3 / MILLION,
    output: 15 / MILLION,
  },
  "anthropic.claude-3-5-sonnet-20241022-v2:0": {
    input: 3 / MILLION,
    output: 15 / MILLION,
  },
  // https://groq.com/pricing/
  "llama3-groq-70b-8192-tool-use-preview": {
    input: 0.89 / MILLION,
    output: 0.89 / MILLION,
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
