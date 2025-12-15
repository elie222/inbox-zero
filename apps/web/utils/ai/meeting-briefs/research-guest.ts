import { createPerplexity } from "@ai-sdk/perplexity";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { ToolSet } from "ai";
import { env } from "@/env";
import { createGenerateText } from "@/utils/llms";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI, UserAIFields } from "@/utils/llms/types";
import {
  getCachedPerplexityResearch,
  setCachedPerplexityResearch,
} from "@/utils/redis/perplexity-research";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { getModel, type SelectModel } from "@/utils/llms/model";
import { Provider } from "@/utils/llms/config";

export async function researchGuestWithPerplexity({
  name,
  email,
  event,
  emailAccount,
  logger,
}: {
  name?: string;
  email: string;
  event: CalendarEvent | null;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<string | null> {
  const modelOptions = getLlmModel(emailAccount.user);

  if (!modelOptions) {
    logger.warn("No LLM model available for guest research, skipping research");
    return null;
  }

  const cached = await getCachedPerplexityResearch(
    emailAccount.userId,
    email,
    name,
  );
  if (cached) {
    logger.info("Using cached Perplexity research");
    return cached;
  }

  try {
    const prompt = `${
      name
        ? `Research ${name}.`
        : `First, identify the person's name from the meeting details below or derive it from their email address. Then search for them by name.`
    }
Their email is: ${email}.

Upcoming meeting details to help you research the guest:

${
  event
    ? `<event>
<title>${event.title}</title>
<description>${event.description}</description>
<location>${event.location}</location>
</event>`
    : ""
}

Tell me about what they do, their current role, company, and work history.
Include any relevant profile URLs you find (LinkedIn, company page, personal site, etc).

IMPORTANT: Report back all searches you made in order to come up with the information you provided me.`;

    const generateText = createGenerateText({
      emailAccount,
      label: "Guest Research",
      modelOptions,
    });

    const result = await generateText({
      prompt,
      model: modelOptions.model,
      tools: modelOptions.tools,
    });

    // Fire-and-forget: cache write should never block or lose the result
    setCachedPerplexityResearch(
      emailAccount.userId,
      email,
      name,
      result.text,
    ).catch((error) => {
      logger.error("Failed to cache Perplexity research", { error });
    });

    return result.text;
  } catch (error) {
    logger.error("Failed to research guest with Perplexity", { error });
    return null;
  }
}

function getLlmModel(
  userAi: UserAIFields,
): (SelectModel & { tools: ToolSet }) | null {
  if (env.PERPLEXITY_API_KEY) {
    const perplexityProvider = createPerplexity({
      apiKey: env.PERPLEXITY_API_KEY,
    });

    const modelName = "sonar-pro";
    const model = perplexityProvider(modelName);

    return {
      modelName,
      model,
      provider: "perplexity",
      backupModel: null,
      tools: {},
    };
  }

  if (env.DEFAULT_LLM_PROVIDER === Provider.OPENROUTER) {
    return { ...getModel(userAi, "economy", true), tools: {} };
  }

  if (env.DEFAULT_LLM_PROVIDER === Provider.OPEN_AI) {
    return {
      ...getModel(userAi, "economy"),
      tools: {
        web_search: openai.tools.webSearch({}),
      },
    };
  }

  if (env.DEFAULT_LLM_PROVIDER === Provider.GOOGLE) {
    return {
      ...getModel(userAi, "economy"),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
    };
  }

  return null;
}
