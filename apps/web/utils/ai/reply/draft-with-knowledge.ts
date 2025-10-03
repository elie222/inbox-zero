import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateObject } from "@/utils/llms/index";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";
import type { ReplyContextCollectorResult } from "@/utils/ai/reply/reply-context-collector";
import type { CalendarAvailabilityContext } from "@/utils/ai/calendar/availability";

const logger = createScopedLogger("DraftWithKnowledge");

const system = `You are an expert assistant that drafts email replies using knowledge base information.
Write a polite and professional email that follows up on the previous conversation.
Keep it concise and friendly.
IMPORTANT: Keep the reply short. Aim for 2 sentences at most.
Don't be pushy.
Use context from the previous emails and the provided knowledge base to make it relevant and accurate.
IMPORTANT: Do NOT simply repeat or mirror what the last email said. It doesn't add anything to the conversation to repeat back to them what they just said.
Your reply should aim to continue the conversation or provide new information based on the context or knowledge base. If you have nothing substantial to add, keep the reply minimal.
Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.

IMPORTANT: Use placeholders sparingly! Only use them where you have limited information.
Never use placeholders for the user's name. You do not need to sign off with the user's name. Do not add a signature.
Do not invent information.
Don't suggest meeting times or mention availability unless specific calendar information is provided.

Return your response in JSON format.
`;

const getUserPrompt = ({
  messages,
  emailAccount,
  knowledgeBaseContent,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  mcpContext,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  mcpContext: string | null;
}) => {
  const userAbout = emailAccount.about
    ? `Context about the user:
    
<userAbout>
${emailAccount.about}
</userAbout>
`
    : "";

  const relevantKnowledge = knowledgeBaseContent
    ? `Relevant knowledge base content:
    
<knowledge_base>
${knowledgeBaseContent}
</knowledge_base>
`
    : "";

  const historicalContext = emailHistorySummary
    ? `Historical email context with this sender:
    
<sender_history>
${emailHistorySummary}
</sender_history>
`
    : "";

  const precedentHistoryContext = emailHistoryContext?.relevantEmails.length
    ? `Information from similar email threads that may be relevant to the current conversation to draft a reply.
    
<email_history>
${emailHistoryContext.relevantEmails
  .map(
    (item) => `<item>
${item}
</item>`,
  )
  .join("\n")}
</email_history>

<email_history_notes>
${emailHistoryContext.notes || "No notes"}
</email_history_notes>
`
    : "";

  const writingStylePrompt = writingStyle
    ? `Writing style:
    
<writing_style>
${writingStyle}
</writing_style>
`
    : "";

  const calendarContext = calendarAvailability?.suggestedTimes.length
    ? `Calendar availability information:
    
<calendar_availability>
Suggested times: ${calendarAvailability.suggestedTimes.join(", ")}
</calendar_availability>

IMPORTANT: Use this calendar information to suggest specific available times when responding to meeting requests. You can now offer specific times when the user is available.
`
    : "";

  const mcpToolsContext = mcpContext
    ? `Additional context fetched from external tools (such as CRM systems, task managers, or other integrations) that may help draft a response:
    
<external_tools_context>
${mcpContext}
</external_tools_context>
`
    : "";

  return `${userAbout}
${relevantKnowledge}
${historicalContext}
${precedentHistoryContext}
${writingStylePrompt}
${calendarContext}
${mcpToolsContext}

Here is the context of the email thread (from oldest to newest):
${getEmailListPrompt({ messages, messageMaxLength: 3000 })}
     
Please write a reply to the email.
${getTodayForLLM()}
IMPORTANT: You are writing an email as ${emailAccount.email}. Write the reply from their perspective.`;
};

const draftSchema = z.object({
  reply: z
    .string()
    .describe(
      "The complete email reply draft incorporating knowledge base information",
    ),
});

export async function aiDraftWithKnowledge({
  messages,
  emailAccount,
  knowledgeBaseContent,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  mcpContext,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  mcpContext: string | null;
}) {
  try {
    logger.info("Drafting email with knowledge base", {
      messageCount: messages.length,
      hasKnowledge: !!knowledgeBaseContent,
      hasHistory: !!emailHistorySummary,
    });

    const prompt = getUserPrompt({
      messages,
      emailAccount,
      knowledgeBaseContent,
      emailHistorySummary,
      emailHistoryContext,
      calendarAvailability,
      writingStyle,
      mcpContext,
    });

    const modelOptions = getModel(emailAccount.user);

    const generateObject = createGenerateObject({
      userEmail: emailAccount.email,
      label: "Email draft with knowledge",
      modelOptions,
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema: draftSchema,
    });

    return result.object.reply;
  } catch (error) {
    logger.error("Failed to draft email with knowledge", { error });
    return {
      error: "Failed to draft email using knowledge base",
    };
  }
}
