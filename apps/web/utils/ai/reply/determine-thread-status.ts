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
  modelType?: ModelType;
}): Promise<{ status: ConversationStatus; rationale: string }> {
  const system = `You are an AI assistant that analyzes email threads to determine their current status.

Your task is to determine the current status of an email thread from the user's perspective. The thread can be in ONE of these mutually exclusive states:

* TO_REPLY - We need to reply
* AWAITING_REPLY - We're waiting for them to reply
* FYI - No reply needed
* ACTIONED - Thread is complete

DETAILED CRITERIA:

**TO_REPLY**: The user has received email(s) that require a response. Use this when:
- Someone asks the user a direct question
- Someone requests information or action from the user
- The user needs to provide specific input
- Someone follows up on a conversation requiring the user's response
- There are ANY unanswered questions/requests in the thread that the user hasn't addressed yet
- The user made a promise/commitment to get back to someone or deliver something and hasn't followed through yet
- IMPORTANT: In multi-person threads, track the USER'S specific commitments even if other people are having separate conversations
- CRITICAL: If the user asked a clarifying question AND got an answer BUT still has a pending commitment/deliverable, it's TO_REPLY (not AWAITING_REPLY) - the answered question was just to help complete the commitment

**AWAITING_REPLY**: Waiting for the other person to take action or respond. Use this when:
- The user asked a question and is still waiting for an answer
- The user requested information/action and is still waiting for it to be delivered
- Someone ELSE promised to do something and hasn't done it yet
- The ball is in their court - it's THEIR turn to respond or act
- The user is NOT the one who needs to reply next
- CRITICAL: If the user requested something and then received a response fulfilling that request, the user is NO LONGER awaiting a reply - the request was fulfilled

**FYI**: Information the user RECEIVED that they should be aware of, but doesn't require a response. Use this when:
- Someone sent the user important updates, announcements, or information they should know about
- The user is CC'd on important matters for their awareness only
- Someone sent status updates that are valuable to know but don't need acknowledgment
- Someone provided requested information/instructions and now the ball is in the user's court to optionally act on it
- NO questions or requests exist anywhere in the thread
- CRITICAL: FYI is ONLY for emails the user RECEIVED. If the user SENT the last email, it cannot be FYI - from the user's perspective, they already know what they sent.

**ACTIONED**: The thread is complete/done. No further action needed from anyone. Use this when:
- All questions have been answered
- All requests have been fulfilled
- Conversation concluded naturally with acknowledgment or confirmation
- The thread reached a natural conclusion with nothing pending
- The user SENT informational content, recommendations, or helpful resources and isn't waiting for a reply

CRITICAL RULES - READ CAREFULLY:
1. **CHECK EVERY MESSAGE**: Don't just look at the latest message. Scan the ENTIRE thread for unanswered questions or pending requests
2. **Unanswered questions persist**: If an earlier message contains an unanswered question or request, and a later message contains only informational content, the status is still determined by the unanswered question/request
3. **Promises from different perspectives**: 
   - If SOMEONE ELSE promised to do something → AWAITING_REPLY (waiting for them)
   - If YOU promised to do something → TO_REPLY (you need to follow through)
4. **Multi-person threads**: In threads with multiple participants, focus ONLY on what the user (the perspective being analyzed) needs to do. Ignore conversations between other people that don't involve the user's commitments.
5. **Request fulfillment**: If the user asked for something (information, help, etc.) and received it, AND the user has no pending commitments/deliverables, they are no longer awaiting a reply. The status should be FYI (if informational) or ACTIONED (if fully resolved). However, if the user still has a pending commitment, see Rule 6.
6. **Clarifying questions don't cancel commitments**: If the user has a pending commitment/deliverable and asks a clarifying question that gets answered, the status is TO_REPLY (not AWAITING_REPLY). The user needs to complete their original commitment now that they have the clarification.
7. **User sends info/recommendations**: When the user SENDS informational content, advice, or recommendations without asking questions or expecting specific actions, it's ACTIONED (not AWAITING_REPLY). The user completed their action and isn't waiting for anything.
8. **Latest message context matters**: If the latest message is purely informational but there are unresolved items earlier in the thread, prioritize the unresolved items
9. **FYI is only when nothing is pending**: Use FYI ONLY when there are absolutely no questions, requests, or pending actions in the entire thread

Respond with a JSON object with:
- status: One of TO_REPLY, FYI, AWAITING_REPLY, or ACTIONED
- rationale: Brief one-line explanation for the decision`;

  const prompt = `${getUserInfoPrompt({ emailAccount })}

Email thread (in chronological order, oldest to newest):

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
