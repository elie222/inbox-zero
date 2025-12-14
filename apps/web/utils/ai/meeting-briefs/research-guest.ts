import type { LanguageModelV2 } from "@ai-sdk/provider";
import { createPerplexity } from "@ai-sdk/perplexity";
import { env } from "@/env";
import { createGenerateText } from "@/utils/llms";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";

export async function researchGuestWithPerplexity({
  name,
  email,
  emailAccount,
  logger,
}: {
  name?: string;
  email: string;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<string | null> {
  if (!env.PERPLEXITY_API_KEY) {
    logger.info("Perplexity API key not configured, skipping guest research");
    return null;
  }

  try {
    const prompt = `Find the LinkedIn profile${name ? ` for ${name}` : ""}.
Their email is: ${email}.
Tell me about what they do, their current role, company, and work history. If you find their LinkedIn profile, include the URL.`;

    const perplexityProvider = createPerplexity({
      apiKey: env.PERPLEXITY_API_KEY,
    });

    const modelName = "sonar";
    const model: LanguageModelV2 = perplexityProvider(modelName);

    const generateText = createGenerateText({
      emailAccount,
      label: "Guest Research",
      modelOptions: {
        provider: "perplexity",
        modelName,
        model,
        backupModel: null,
      },
    });

    const result = await generateText({
      prompt,
      model,
    });

    return result.text;
  } catch (error) {
    logger.error("Failed to research guest with Perplexity", { error });
    return null;
  }
}
