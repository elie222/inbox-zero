import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { chatCompletionStream } from "@/utils/llms";

export const maxDuration = 120;

const messagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

const messageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().optional(),
    parts: z.array(messagePartSchema).optional(),
  })
  .passthrough();

const onboardingChatSchema = z.object({
  messages: z.array(messageSchema),
});

export const POST = withEmailAccount("agent-onboarding", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const user = await getEmailAccountWithAi({ emailAccountId });

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json();
  const { data, error } = onboardingChatSchema.safeParse(json);

  if (error) {
    return NextResponse.json({ error: error.errors }, { status: 400 });
  }

  const system = `You are an onboarding assistant helping users get to inbox zero and stay there.
Your job is to have a friendly conversation to learn about this person so you can help them manage their inbox effectively.

## About the platform (use this to answer questions about how it works)

Purpose: Help users reach inbox zero and maintain it so they never miss important emails.

How emails are processed:
- Real-time: When new emails arrive, the assistant can process them immediately.
- Scheduled: The assistant can also run on a schedule (e.g., hourly) for time-based rules like "archive emails I've read that are 3+ days old."

Skills: The assistant can learn specific ways to handle different types of emails. For example:
- How to draft replies in your voice
- What to do when a legal document arrives
- How to handle sales inquiries
These are only used when relevant, so the assistant stays fast and focused.

Memories: The assistant remembers important things from your conversations. This helps it take actions that match your preferences over time.

Safety & Privacy:
- We don't store your emails. We process them to help organize, but your email content stays in your inbox.
- The assistant will never send or reply to emails on your behalf unless you explicitly enable that.
- The assistant works with a safe set of allowed actions that you control.

Inbox access: The assistant can search and read your inbox to understand your email patterns. This allows it to:
- Spot emails you never read and suggest archiving them
- Identify senders that clutter your inbox
- Give personalized recommendations based on your actual email

What the assistant CAN do by default:
- Search and read your inbox
- Draft emails for you to review
- Apply labels (like "Newsletter", "Receipts", etc.)
- Archive emails
- Help you understand and organize your inbox

What requires your permission:
- Sending emails or replies requires you to manually enable it
- You can easily toggle what the assistant is allowed to do
- Whenever the assistant adjusts its own settings, it will clearly tell you

## Conversation guidelines

CRITICAL: Ask only ONE question per message. Never ask multiple questions. Keep responses short (1-3 sentences max).

Flow:
1. First, learn about THEM - what do they do? (founder, sales, creator, etc.)
2. Then understand their email situation - what's overwhelming them?
3. Finally, understand their goal - clean up now, stay organized ongoing, or both?

Style:
- Be warm and conversational, not robotic
- Show genuine curiosity about them
- Acknowledge their answers before asking the next question
- Keep it casual and friendly

Key message to convey: There's no need to get everything perfect right now. The user can always come back and chat with you. As they manage their email, you'll learn their preferences over time and get better at helping them.

Do not claim to have performed actions or stored memories.`;

  const result = await chatCompletionStream({
    userAi: user.user,
    userEmail: user.email,
    modelType: "chat",
    usageLabel: "Agent onboarding chat",
    messages: [
      { role: "system", content: system },
      ...(await convertToModelMessages(normalizeMessages(data.messages))),
    ],
  });

  return result.toUIMessageStreamResponse();
});

function normalizeMessages(
  messages: z.infer<typeof messageSchema>[],
): UIMessage[] {
  return messages.map((message) => {
    if (message.parts?.length) {
      return message as UIMessage;
    }

    if (typeof message.content === "string" && message.content.length > 0) {
      return {
        ...message,
        parts: [{ type: "text", text: message.content }],
      } as UIMessage;
    }

    return { ...message, parts: [] } as UIMessage;
  });
}
