import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";
import {
  DRAFT_PIPELINE_VERSION,
  type DraftAttribution,
} from "@/utils/ai/reply/draft-attribution";
import {
  PLAIN_TEXT_OUTPUT_INSTRUCTION,
  PROMPT_SECURITY_INSTRUCTIONS,
} from "@/utils/ai/security";

export async function aiGenerateNudge({
  messages,
  emailAccount,
}: {
  messages: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
  onFinish?: (completion: string) => Promise<void>;
}) {
  const system = `You are an expert at writing follow-up emails that get responses.

${PROMPT_SECURITY_INSTRUCTIONS}

Write a polite and professional email that follows up on the previous conversation.
Keep it concise and friendly. Don't be pushy.
Use context from the previous emails to make it relevant.
Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.
Keep it short.
${PLAIN_TEXT_OUTPUT_INSTRUCTION}`;

  const prompt = `Here is the context of the email thread (from oldest to newest):
${getEmailListPrompt({ messages, messageMaxLength: 3000 })}
     
Write a brief follow-up email to politely nudge for a response.

${getTodayForLLM()}
IMPORTANT: The person you're writing an email for is: ${messages.at(-1)?.from}.`;

  const modelOptions = getModel(emailAccount.user, "chat");
  let attribution: DraftAttribution | null = null;

  const generateText = createGenerateText({
    label: "Reply",
    emailAccount,
    modelOptions,
    onModelUsed: ({ provider, modelName }) => {
      attribution = {
        provider,
        modelName,
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      };
    },
  });

  const response = await generateText({
    ...modelOptions,
    system,
    prompt,
  });

  return {
    text: response.text,
    attribution,
  };
}
