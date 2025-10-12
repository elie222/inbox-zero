import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { USER_ROLES } from "@/utils/constants/user-roles";
import { getEmailListPrompt } from "@/utils/ai/helpers";

const logger = createScopedLogger("persona-analyzer");

export const personaAnalysisSchema = z.object({
  persona: z
    .string()
    .describe(
      "The identified professional role (can be from the provided list or a custom role if evidence strongly suggests otherwise)",
    ),
  industry: z
    .string()
    .describe(
      "The specific industry or sector they work in (e.g., SaaS, Healthcare, E-commerce, Education, Finance, etc.)",
    ),
  positionLevel: z
    .enum(["entry", "mid", "senior", "executive"])
    .describe(
      "Their seniority level based on decision-making authority and responsibilities",
    ),
  responsibilities: z
    .array(z.string())
    .describe(
      "An array of 3-5 key responsibilities evident from their email patterns and communications",
    ),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe(
      "Your confidence level in this assessment based on the available evidence",
    ),
  reasoning: z
    .string()
    .describe(
      "Brief explanation of why this persona was chosen, citing specific evidence from the emails",
    ),
});

export type PersonaAnalysis = z.infer<typeof personaAnalysisSchema>;

export async function aiAnalyzePersona(options: {
  emails: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
}): Promise<PersonaAnalysis | null> {
  const { emails, emailAccount } = options;

  if (!emails.length) {
    logger.warn("No emails provided for persona analysis");
    return null;
  }

  const rolesList = USER_ROLES.map(
    (role) => `- ${role.value}: ${role.description}`,
  ).join("\n");

  const system = `You are a persona analyst specializing in identifying professional roles and personas based on email communication patterns.

Analyze the user's emails to determine their most likely professional role or persona. Examine the content, context, recipients, and communication patterns to identify:

1. Their primary professional role or function
2. The industry or sector they likely work in
3. Their position level (entry, mid, senior, executive)
4. Key responsibilities evident from their communications

Consider these common personas as defaults, but feel free to suggest a more specific or different role if the evidence strongly points elsewhere:
${rolesList}

If the user doesn't clearly fit into one of these categories, provide a custom persona that better describes their role based on the email evidence.

Base your analysis on:
- Topics discussed in emails
- Types of recipients (clients, team members, vendors, etc.)
- Business terminology and jargon used
- Meeting types and purposes
- Projects or deals mentioned
- Decision-making authority evident
- Communication frequency and urgency

Return a JSON object with the analyzed persona information.`;

  const prompt = `The user's email address is: ${emailAccount.email}

This is important: You are analyzing the persona of ${emailAccount.email}. Look at what they write about, how they communicate, and who they interact with to determine their professional role.

Here are the emails they've sent:
<emails>
${getEmailListPrompt({ messages: emails, messageMaxLength: 1000 })}
</emails>`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Persona Analysis",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: personaAnalysisSchema,
  });

  return result.object;
}
