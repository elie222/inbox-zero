import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import type { Knowledge } from "@prisma/client";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";

const logger = createScopedLogger("ai/knowledge/extract");

const SYSTEM_PROMPT = `You are a knowledge extraction agent. Your task is to analyze the provided knowledge base entries and extract the most relevant information for drafting an email response.

Given:
1. A set of knowledge base entries (each with a title and content)
2. The content of an email that needs to be responded to

Your task:
1. Analyze the email content to understand the context and requirements
2. Review all knowledge base entries
3. Extract and summarize the most relevant information that would be useful for drafting a response
4. Provide a brief explanation of why this information is relevant

Keep the extracted content concise (max 2000 characters) but include all crucial information.
Format your response in JSON with two fields:
- relevantContent: The extracted, relevant information
- explanation: A brief explanation of why this information is relevant

Remember: Quality over quantity. Only include truly relevant information.
You do not need to draft the response, just extract the relevant information.
The information you used will be passed to another agent that will draft the response.`;

const USER_PROMPT = ({
  knowledgeBase,
  emailContent,
  user,
}: {
  knowledgeBase: Knowledge[];
  emailContent: string;
  user: UserEmailWithAI;
}) => {
  const knowledgeBaseText = knowledgeBase
    .map((k) => `Title: ${k.title}\nContent: ${k.content}`)
    .join("\n\n");

  return `<email>
${emailContent}
</email>

<knowledge_base>
${knowledgeBaseText}
</knowledge_base>

${
  user.about
    ? `<user_info>
<about>${user.about}</about>
<email>${user.email}</email>
</user_info>`
    : `<user_info>
<email>${user.email}</email>
</user_info>`
}

Extract the most relevant information for drafting a response to this email.`;
};

const extractionSchema = z.object({ relevantContent: z.string() });

export async function aiExtractRelevantKnowledge({
  knowledgeBase,
  emailContent,
  user,
}: {
  knowledgeBase: Knowledge[];
  emailContent: string;
  user: UserEmailWithAI;
}): Promise<string | null> {
  try {
    if (!knowledgeBase.length) return null;

    const system = SYSTEM_PROMPT;
    const prompt = USER_PROMPT({ knowledgeBase, emailContent, user });

    logger.trace("Input", { system, prompt });

    const result = await chatCompletionObject({
      system,
      prompt,
      schema: extractionSchema,
      usageLabel: "Knowledge extraction",
      userAi: user,
      userEmail: user.email,
      useEconomyModel: true,
    });

    logger.trace("Output", result.object);

    return result.object.relevantContent;
  } catch (error) {
    logger.error("Failed to extract knowledge", { error });
    return null;
  }
}
