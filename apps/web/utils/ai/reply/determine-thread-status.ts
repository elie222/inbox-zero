import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { getUserInfoPrompt, getEmailListPrompt } from "@/utils/ai/helpers";
import type { ConversationStatus } from "@/utils/reply-tracker/conversation-status-config";
import { SystemType } from "@prisma/client";

export async function aiDetermineThreadStatus({
  emailAccount,
  threadMessages,
  modelType,
}: {
  emailAccount: EmailAccountWithAI;
  threadMessages: EmailForLLM[];
  modelType: ModelType;
}): Promise<{ status: ConversationStatus; rationale: string }> {
  const system = `You are an AI assistant that analyzes email threads to determine their current status.

Your task is to determine the current status of an email thread from the user's perspective. The thread can be in ONE of these mutually exclusive states:

**TO_REPLY**: The user has received email(s) that require a response. Use this when:
- Someone asks the user a direct question
- Someone requests information or action from the user
- The user needs to provide specific input
- Someone follows up on a conversation requiring the user's response
- There are ANY unanswered questions/requests in the thread that the user hasn't addressed yet

**FYI**: The user received important email(s) that don't require a response. Use this when:
- Important updates, announcements, or information the user should be aware of
- CC'd on important matters for awareness only
- Status updates that are valuable to know but don't need acknowledgment
- NO questions or requests exist anywhere in the thread

**AWAITING_REPLY**: Waiting for the other person to take action or respond. Use this when:
- The user asked a question and is waiting for an answer
- The user requested information/action and is waiting for it to be delivered
- Someone promised to do something (e.g., "I'll get this for you tomorrow", "Let me check and get back to you")
- It's the other person's turn to deliver something or take action
- The ball is in their court

**ACTIONED**: The thread is complete/done. No further action needed from anyone. Use this when:
- All questions have been answered
- All requests have been fulfilled
- Conversation concluded with "thanks", "got it", "sounds good", etc.
- The thread reached a natural conclusion with nothing pending

CRITICAL RULES - READ CAREFULLY:
1. **CHECK EVERY MESSAGE**: Don't just look at the latest message. Scan the ENTIRE thread for unanswered questions or pending requests
2. **Unanswered questions persist**: If message #1 asks "Can you send me the report?" and message #2 says "FYI, meeting moved to 3pm", the status is still TO_REPLY because the report request is unanswered
3. **Promises = AWAITING_REPLY**: If someone says "I'll get back to you", "Let me check", "I'll send that tomorrow" → AWAITING_REPLY (not FYI)
4. **Latest message context matters**: If the latest message is purely FYI but there are unresolved items earlier in the thread, prioritize the unresolved items
5. **FYI is only when nothing is pending**: Use FYI ONLY when there are absolutely no questions, requests, or pending actions in the entire thread

Respond with a JSON object with:
- status: One of TO_REPLY, FYI, AWAITING_REPLY, or ACTIONED
- rationale: Brief one-line explanation for the decision`;

  const prompt = `${getUserInfoPrompt({ emailAccount })}

Email thread (most recent message first):

<thread>
${getEmailListPrompt({
  messages: threadMessages,
  messageMaxLength: 1000,
})}
</thread>

Based on the full thread context above, determine the current status of this thread.`.trim();

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Determine thread status",
    modelOptions,
  });

  const schema = z.object({
    status: z.enum([
      SystemType.TO_REPLY,
      SystemType.FYI,
      SystemType.AWAITING_REPLY,
      SystemType.ACTIONED,
    ]),
    rationale: z.string(),
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return aiResponse.object;
}
