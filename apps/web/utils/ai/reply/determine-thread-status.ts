import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM, RuleWithActions } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { getUserInfoPrompt, getEmailListPrompt } from "@/utils/ai/helpers";
import type { ConversationStatus } from "@/utils/reply-tracker/conversation-status-config";
import { THREAD_STATUS_LATEST_MESSAGE_MAX_LENGTH } from "@/utils/reply-tracker/thread-status-context";
import { SystemType } from "@/generated/prisma/enums";
import { getRuleConfig, isDefaultRuleInstructions } from "@/utils/rule/consts";

const STATUS_ORDER = [
  SystemType.TO_REPLY,
  SystemType.AWAITING_REPLY,
  SystemType.FYI,
  SystemType.ACTIONED,
] as const;

/**
 * What each status means, in the words the user sees on the rule.
 *
 * The rule's `instructions` are the single definition of a status: the default
 * from `getRuleConfig`, or the user's own text if they edited it. The prompt
 * below only says how to read a thread, not what the labels mean.
 */
export function getConversationStatusDefinitions(
  conversationRules: RuleWithActions[],
  statuses: readonly ConversationStatus[] = STATUS_ORDER,
): { systemType: ConversationStatus; instructions: string }[] {
  return statuses.map((systemType) => {
    const rule = conversationRules.find(
      (r) => r.systemType === systemType && r.enabled,
    );
    const instructions =
      rule?.instructions &&
      !isDefaultRuleInstructions(systemType, rule.instructions)
        ? rule.instructions
        : getRuleConfig(systemType).instructions;
    return { systemType, instructions };
  });
}

export async function aiDetermineThreadStatus({
  emailAccount,
  threadMessages,
  modelType,
  userSentLastEmail = false,
  conversationRules = [],
}: {
  emailAccount: EmailAccountWithAI;
  threadMessages: EmailForLLM[];
  modelType?: ModelType;
  userSentLastEmail?: boolean;
  conversationRules?: RuleWithActions[];
}): Promise<{ status: ConversationStatus; rationale: string }> {
  // If the user sent the last email, FYI is not an option: from their
  // perspective they already know what they sent.
  const statuses = userSentLastEmail
    ? STATUS_ORDER.filter((status) => status !== SystemType.FYI)
    : STATUS_ORDER;

  const definitions = getConversationStatusDefinitions(
    conversationRules,
    statuses,
  );

  const system = `You are an AI assistant that analyzes email threads to determine their current status.

Your task is to determine the current status of an email thread from the user's perspective. The thread can be in ONE of these mutually exclusive states:

${definitions.map((d) => `* ${d.systemType} - ${d.instructions}`).join("\n")}

HOW TO READ THE THREAD - READ CAREFULLY:
1. **CHECK EVERY MESSAGE**: Don't just look at the latest message. Scan the ENTIRE thread for unanswered questions or pending requests
2. **Unanswered questions persist**: If an earlier message contains an unanswered question or request, and a later message contains only informational content, the status is still determined by the unanswered question/request. It's TO_REPLY if the user owes the answer and AWAITING_REPLY if someone else does
3. **Promises from different perspectives**:
   - If SOMEONE ELSE promised to do something or get back to the user → AWAITING_REPLY (waiting for them)
   - If the USER promised a future reply, answer, or deliverable back to the sender and hasn't sent it yet → TO_REPLY
4. **Multi-person threads**: In threads with multiple participants, focus ONLY on what the user (the perspective being analyzed) needs to do. Ignore conversations between other people that don't involve the user's commitments
5. **Request fulfillment**: If the user asked for something (information, help, etc.) and received it, OR another participant fully handled a request involving the user, AND the user has no pending commitments/deliverables, the thread is ACTIONED. The user is no longer awaiting a reply. However, if the user still has a pending commitment, see Rule 6
6. **Clarifying questions don't cancel commitments**: If the user has a pending commitment/deliverable and asks a clarifying question that gets answered, the status is TO_REPLY (not AWAITING_REPLY). The user needs to complete their original commitment now that they have the clarification
7. **Taking ownership can fulfill the request**: If the sender asked the user to do something and the user's latest reply takes ownership of it ("I'll handle it", "I'll take care of it", "I'll get that fixed"), treat the request as fulfilled and classify ACTIONED unless that reply clearly promises another email update, answer, or deliverable later
8. **User sends info/recommendations**: When the user SENDS informational content, advice, or recommendations without asking questions or expecting specific actions, it's ACTIONED (not AWAITING_REPLY). The user completed their action and isn't waiting for anything
9. **Latest message context matters**: If the latest message is purely informational but there are unresolved items earlier in the thread, prioritize the unresolved items
10. **Counter-questions and follow-ups**: If the other person answers the user and asks a further question, or replies to the user with a new question, the next response is on the user → TO_REPLY${
    userSentLastEmail
      ? `
11. **User sent last email**: Since the user sent the last email, FYI is NOT an option. Choose AWAITING_REPLY if waiting for a response, or ACTIONED if the thread is complete`
      : `
11. **FYI is only when nothing was ever asked**: Use FYI ONLY when the user RECEIVED the messages and there are no questions, requests, or pending actions anywhere in the thread, including ones that have since been fulfilled. Being CC'd for awareness, status updates, and announcements are FYI. A fulfilled request is ACTIONED`
  }

Respond with a JSON object with:
- status: One of ${statuses.join(", ")}
- rationale: Brief one-line explanation for the decision`;

  const prompt = `${getUserInfoPrompt({ emailAccount })}

Email thread (in chronological order, oldest to newest):

<thread>
${getEmailListPrompt({
  messages: threadMessages,
  messageMaxLength: THREAD_STATUS_LATEST_MESSAGE_MAX_LENGTH,
})}
</thread>

Based on the full thread context above, determine the current status of this thread.`.trim();

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Determine thread status",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const schema = z.object({
    status: z.enum(statuses),
    rationale: z.string(),
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    instructions: system,
    prompt,
    schema,
  });

  return aiResponse.object;
}
