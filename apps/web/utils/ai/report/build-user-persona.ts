import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailSummary } from "@/utils/ai/report/summarize-emails";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("email-report-user-persona");

const userPersonaSchema = z.object({
  professionalIdentity: z.object({
    persona: z.string().describe("Professional persona identification"),
    supportingEvidence: z
      .array(z.string())
      .describe("Evidence supporting this persona identification"),
  }),
  currentPriorities: z
    .array(z.string())
    .describe("Current professional priorities based on email content"),
});
export type UserPersona = z.infer<typeof userPersonaSchema>;

export async function aiBuildUserPersona(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  sentEmailSummaries?: EmailSummary[],
  gmailSignature?: string,
  gmailTemplates?: string[],
): Promise<z.infer<typeof userPersonaSchema>> {
  const system = `You are a highly skilled AI analyst tasked with generating a focused professional persona of a user based on their email activity.

Analyze the email summaries, signatures, and templates to identify:
1. Professional identity with supporting evidence
2. Current professional priorities based on email content

Focus on understanding the user's role and what they're currently focused on professionally.`;

  const prompt = `### Input Data

**Received Email Summaries:**  
${emailSummaries.map((summary, index) => `Email ${index + 1} Summary: ${summary.summary} (Category: ${summary.category})`).join("\n")}

${
  sentEmailSummaries && sentEmailSummaries.length > 0
    ? `
**Sent Email Summaries:**
${sentEmailSummaries.map((summary, index) => `Sent ${index + 1} Summary: ${summary.summary} (Category: ${summary.category})`).join("\n")}
`
    : ""
}

**User's Signature:**  
${gmailSignature || "[No signature data available – analyze based on email content only]"}

${
  gmailTemplates && gmailTemplates.length > 0
    ? `
**User's Gmail Templates:**
${gmailTemplates.map((template, index) => `Template ${index + 1}: ${template}`).join("\n")}
`
    : ""
}

---

Analyze the data and identify:
1. **Professional Identity**: What is their role and what evidence supports this?
2. **Current Priorities**: What are they focused on professionally based on email content?`;

  logger.trace("Input", { system, prompt });

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "email-report-user-persona",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: userPersonaSchema,
  });

  logger.trace("Output", result.object);

  return result.object;
}
