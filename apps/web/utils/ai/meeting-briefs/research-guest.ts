import type { LanguageModelV2 } from "@ai-sdk/provider";
import { createPerplexity } from "@ai-sdk/perplexity";
import { env } from "@/env";
import { createGenerateText } from "@/utils/llms";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  getCachedPerplexityResearch,
  setCachedPerplexityResearch,
} from "@/utils/redis/perplexity-research";
import type { CalendarEvent } from "@/utils/calendar/event-types";

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
  if (!env.PERPLEXITY_API_KEY) {
    logger.info("Perplexity API key not configured, skipping guest research");
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

    const perplexityProvider = createPerplexity({
      apiKey: env.PERPLEXITY_API_KEY,
    });

    const modelName = "sonar-pro";
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

    await setCachedPerplexityResearch(
      emailAccount.userId,
      email,
      name,
      result.text,
    );

    return result.text;
  } catch (error) {
    logger.error("Failed to research guest with Perplexity", { error });
    return null;
  }
}
