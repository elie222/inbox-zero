import { z } from "zod";
import prisma from "@/utils/prisma";
import { ContactInboxPriority } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { stringifyEmail } from "@/utils/stringify-email";
import { createGenerateObject } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";

// Checks whether the sender's contact settings force this email to stay in
// the inbox, before any rule runs. ALWAYS keeps everything from them; AI
// evaluates the contact's saved instructions against this specific email.
// Returns the user-facing reason when the email must stay put; null means
// the normal rules should run.
export async function getContactInboxPriorityOverride({
  message,
  emailAccount,
  logger,
}: {
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<{ reason: string } | null> {
  const senderEmail = extractEmailAddress(message.headers.from).toLowerCase();
  if (!senderEmail) return null;

  const contact = await prisma.contact.findUnique({
    where: {
      emailAccountId_email: {
        emailAccountId: emailAccount.id,
        email: senderEmail,
      },
    },
    select: { inboxPriority: true, inboxPriorityInstructions: true },
  });

  if (!contact || contact.inboxPriority === ContactInboxPriority.OFF) {
    return null;
  }

  if (contact.inboxPriority === ContactInboxPriority.ALWAYS) {
    return {
      reason: `Kept in inbox: ${senderEmail} is set to always stay in the inbox`,
    };
  }

  // AI mode with nothing to evaluate behaves like ALWAYS — safer than
  // silently running rules against the user's stated intent
  const instructions = contact.inboxPriorityInstructions?.trim();
  if (!instructions) {
    return {
      reason: `Kept in inbox: ${senderEmail} has inbox priority (no instructions set)`,
    };
  }

  try {
    const decision = await aiKeepInInbox({
      emailAccount,
      message,
      instructions,
    });
    logger.info("Contact inbox priority AI decision", {
      keepInInbox: decision.keepInInbox,
    });
    return decision.keepInInbox
      ? { reason: `Kept in inbox: ${decision.reason}` }
      : null;
  } catch (error) {
    // The user marked this sender as important — on an LLM failure keep the
    // mail in the inbox rather than risk a rule archiving it
    logger.error("Contact inbox priority check failed; keeping in inbox", {
      error,
    });
    return {
      reason: `Kept in inbox: ${senderEmail} has inbox priority (couldn't run the AI check)`,
    };
  }
}

async function aiKeepInInbox({
  emailAccount,
  message,
  instructions,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  instructions: string;
}) {
  const system = `You are an assistant that decides whether an incoming email must be kept in the user's inbox.

The user marked this sender as important and wrote instructions describing which of their emails should stay in the inbox. When the email matches the instructions it stays in the inbox untouched; when it doesn't, the user's normal automation rules handle it instead.

<instructions>
${instructions}
</instructions>

${getUserInfoPrompt({ emailAccount })}

<output_format>
Return a JSON object with "reason" and "keepInInbox" fields.
The "reason" should be one concise sentence explaining the decision.
The "keepInInbox" should be true only when the email matches the user's instructions.
</output_format>`;

  const prompt = `<email>
${stringifyEmail(getEmailForLLM(message), 1000)}
</email>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.ContactInboxPriority,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Contact inbox priority",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const response = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      reason: z.string(),
      keepInInbox: z.boolean(),
    }),
  });

  return response.object;
}
