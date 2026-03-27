import { createGenerateText } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";
import type { ParsedMessage } from "@/utils/types";

const REWRITE_SYSTEM_PROMPT = `You revise draft email replies based on explicit user edit instructions.

${PROMPT_SECURITY_INSTRUCTIONS}

Return only the updated email body as an HTML fragment.
Do not include a subject line.
Preserve existing links when they still make sense.
Do not add a signature unless one is already present in the current draft.
Do not mention that you are an AI.
Do not use em dashes unless the existing draft already uses them or the instruction explicitly asks for them.`;

export async function aiRewriteOutboundProposal({
  emailAccount,
  originalMessage,
  currentContent,
  instructions,
}: {
  emailAccount: EmailAccountWithAI;
  originalMessage: ParsedMessage;
  currentContent: string;
  instructions: string;
}) {
  // Review-thread edits stay on a constrained one-shot rewrite path so we only
  // revise the existing proposal content and avoid the broader assistant flow.
  const modelOptions = getModel(emailAccount.user, "chat");
  const generateText = createGenerateText({
    label: "Rewrite outbound proposal",
    emailAccount,
    modelOptions,
  });

  const response = await generateText({
    ...modelOptions,
    system: REWRITE_SYSTEM_PROMPT,
    prompt: `Original email:
From: ${originalMessage.headers.from || ""}
Subject: ${originalMessage.headers.subject || ""}

Latest message content:
${originalMessage.textPlain || originalMessage.textHtml || ""}

Current draft:
${currentContent}

User instructions:
${instructions}

Rewrite the current draft to satisfy the instructions. Return only the updated HTML body fragment.`,
  });

  return response.text.trim();
}
