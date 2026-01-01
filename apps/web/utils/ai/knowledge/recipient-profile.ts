import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { truncate, removeExcessiveWhitespace } from "@/utils/string";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("recipient-profile");

const recipientProfileSchema = z.object({
  formality: z
    .enum(["formal", "neutral", "casual"])
    .describe("The formality level used when writing to this recipient"),
  typicalGreeting: z
    .string()
    .describe(
      "The typical greeting used, e.g., 'Hi', 'Dear', 'Hey', or empty if none",
    ),
  typicalSignoff: z
    .string()
    .describe(
      "The typical sign-off used, e.g., 'Best', 'Thanks', 'Cheers', or empty if none",
    ),
  averageLength: z
    .enum(["brief", "moderate", "detailed"])
    .describe("The typical length of emails to this recipient"),
});

type RecipientProfileAnalysis = z.infer<typeof recipientProfileSchema>;

/**
 * Analyzes how the user typically communicates with a specific recipient
 * based on their sent email history.
 */
export async function aiAnalyzeRecipientProfile(options: {
  sentEmails: EmailForLLM[];
  recipientEmail: string;
  emailAccount: EmailAccountWithAI;
}): Promise<RecipientProfileAnalysis | null> {
  const { sentEmails, recipientEmail, emailAccount } = options;

  if (sentEmails.length < 2) {
    logger.debug("Insufficient emails for recipient profile analysis", {
      recipientEmail,
      emailCount: sentEmails.length,
    });
    return null;
  }

  const system = `You are a communication pattern analyst specializing in email correspondence.

Analyze the emails the user has sent TO a specific recipient to understand how they typically communicate with this person. Look for patterns in:

1. Formality level - Is the tone formal, neutral, or casual?
2. Greeting style - What greeting do they typically use? (e.g., "Dear Mr. Smith", "Hi John", "Hey!", or none)
3. Sign-off style - How do they typically end emails? (e.g., "Best regards", "Thanks", "Cheers", or none)
4. Email length - Are their emails typically brief, moderate, or detailed?

Base your analysis on the actual patterns observed in the provided emails.
Return your analysis in JSON format.`;

  const prompt = `Analyze my communication style with this specific recipient.

Recipient email: ${recipientEmail}

Here are emails I've previously sent to this recipient:
<emails>
${sentEmails
  .slice(0, 10) // limit to 10 most recent
  .map(
    (e, i) => `<email index="${i + 1}">
${truncate(removeExcessiveWhitespace(e.content), 800)}
</email>`,
  )
  .join("\n")}
</emails>

Based on these emails, identify my typical communication patterns with this recipient.`;

  try {
    const modelOptions = getModel(emailAccount.user);

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Recipient Profile Analysis",
      modelOptions,
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema: recipientProfileSchema,
    });

    logger.debug("Recipient profile analysis complete", {
      recipientEmail,
      result: result.object,
    });

    return result.object;
  } catch (error) {
    logger.error("Failed to analyze recipient profile", {
      error,
      recipientEmail,
    });
    return null;
  }
}

/**
 * Gets or creates a recipient profile for the given email address.
 * Returns null if no profile exists and there's insufficient data to create one.
 */
export async function getRecipientProfile(options: {
  emailAccountId: string;
  recipientEmail: string;
}): Promise<{
  formality: string | null;
  typicalGreeting: string | null;
  typicalSignoff: string | null;
} | null> {
  const { emailAccountId, recipientEmail } = options;
  const normalizedEmail = recipientEmail.toLowerCase().trim();

  try {
    const profile = await prisma.recipientProfile.findUnique({
      where: {
        emailAccountId_recipientEmail: {
          emailAccountId,
          recipientEmail: normalizedEmail,
        },
      },
      select: {
        detectedFormality: true,
        typicalGreeting: true,
        typicalSignoff: true,
        lastAnalyzedAt: true,
      },
    });

    if (!profile) {
      return null;
    }

    return {
      formality: profile.detectedFormality,
      typicalGreeting: profile.typicalGreeting,
      typicalSignoff: profile.typicalSignoff,
    };
  } catch (error) {
    logger.error("Failed to get recipient profile", { error, recipientEmail });
    return null;
  }
}

/**
 * Saves or updates a recipient profile based on analysis results.
 */
export async function saveRecipientProfile(options: {
  emailAccountId: string;
  recipientEmail: string;
  analysis: RecipientProfileAnalysis;
  sampleCount: number;
}): Promise<void> {
  const { emailAccountId, recipientEmail, analysis, sampleCount } = options;
  const normalizedEmail = recipientEmail.toLowerCase().trim();

  try {
    await prisma.recipientProfile.upsert({
      where: {
        emailAccountId_recipientEmail: {
          emailAccountId,
          recipientEmail: normalizedEmail,
        },
      },
      create: {
        emailAccountId,
        recipientEmail: normalizedEmail,
        detectedFormality: analysis.formality,
        typicalGreeting: analysis.typicalGreeting || null,
        typicalSignoff: analysis.typicalSignoff || null,
        sampleCount,
        lastAnalyzedAt: new Date(),
      },
      update: {
        detectedFormality: analysis.formality,
        typicalGreeting: analysis.typicalGreeting || null,
        typicalSignoff: analysis.typicalSignoff || null,
        sampleCount,
        lastAnalyzedAt: new Date(),
      },
    });

    logger.info("Saved recipient profile", {
      recipientEmail: normalizedEmail,
      formality: analysis.formality,
    });
  } catch (error) {
    logger.error("Failed to save recipient profile", { error, recipientEmail });
  }
}

/**
 * Formats recipient profile for inclusion in AI prompts.
 */
export function formatRecipientProfileForPrompt(
  profile: {
    formality: string | null;
    typicalGreeting: string | null;
    typicalSignoff: string | null;
  } | null,
): string | null {
  if (!profile || !profile.formality) {
    return null;
  }

  const parts: string[] = [];

  parts.push(`Formality level: ${profile.formality}`);

  if (profile.typicalGreeting) {
    parts.push(`Typical greeting: "${profile.typicalGreeting}"`);
  }

  if (profile.typicalSignoff) {
    parts.push(`Typical sign-off: "${profile.typicalSignoff}"`);
  }

  return `Based on previous emails to this recipient, match the established communication style:

<recipient_communication_style>
${parts.join("\n")}
</recipient_communication_style>

Adapt your draft to match this style while keeping the content appropriate.`;
}
