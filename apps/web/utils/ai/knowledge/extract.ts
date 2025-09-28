import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import type { Knowledge } from "@prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const logger = createScopedLogger("ai/knowledge/extract");

const system = `You are a knowledge extraction agent. Your task is to analyze the provided knowledge base entries and extract the most relevant information for drafting an email response, based ONLY on the provided knowledge base entries.

Given:
1. A set of knowledge base entries (each with a title and content)
2. The content of an email that needs to be responded to
3. Information about the user responding

Your task:
1. Analyze the email content to understand the context and requirements of the query.
2. Review all knowledge base entries provided in the <knowledge_base> section.
3. Extract and summarize information ONLY from the <knowledge_base> section that is directly relevant to answering the query in the email.
4. Provide a brief explanation of why this specific information from the knowledge base is relevant to the email query.
5. DO NOT include information about the email itself in 'relevantContent'. Your response should ONLY contain information extracted from the knowledge base.
6. If no relevant information is found in the knowledge base, return an empty string for 'relevantContent'.

Keep the extracted content concise (max 2000 characters) but include all crucial information.
Format your response as a JSON object with two fields:
- relevantContent: A string containing the extracted, relevant information from the knowledge base.
- explanation: A brief string explaining why this information is relevant.

Example JSON Output:
{
  "relevantContent": "Extracted info from knowledge base...",
  "explanation": "This info helps address the user's question about X..."
}

Remember: Quality over quantity. Only include truly relevant information from the knowledge base.
You do not need to draft the response, just extract the relevant information.
The information you extract will be passed to another agent that will draft the response.`;

const getUserPrompt = ({
  knowledgeBase,
  emailContent,
  emailAccount,
}: {
  knowledgeBase: Knowledge[];
  emailContent: string;
  emailAccount: EmailAccountWithAI;
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

${getUserInfoPrompt({ emailAccount })}

Extract the most relevant information FROM THE KNOWLEDGE BASE for drafting a response to this email.`;
};

const extractionSchema = z.object({
  relevantContent: z
    .string()
    .describe("Extracted relevant information from the knowledge base."),
  explanation: z
    .string()
    .describe("Explanation of why the extracted information is relevant."),
});
export type ExtractedKnowledge = z.infer<typeof extractionSchema>;

export async function aiExtractRelevantKnowledge({
  knowledgeBase,
  emailContent,
  emailAccount,
}: {
  knowledgeBase: Knowledge[];
  emailContent: string;
  emailAccount: EmailAccountWithAI;
}): Promise<ExtractedKnowledge | null> {
  try {
    if (!knowledgeBase.length) return null;

    const prompt = getUserPrompt({ knowledgeBase, emailContent, emailAccount });

    const modelOptions = getModel(emailAccount.user, "economy");

    const generateObject = createGenerateObject({
      userEmail: emailAccount.email,
      label: "Knowledge extraction",
      modelOptions,
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema: extractionSchema,
    });

    return result.object;
  } catch (error) {
    logger.error("Failed to extract knowledge", { error });
    return null;
  }
}
