"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  generateReplySchema,
  type GenerateReplySchema,
} from "@/utils/actions/generate-reply.validation";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { aiGenerateNudge } from "@/utils/ai/reply/generate-nudge";
import { emailToContent } from "@/utils/mail";
import { getReply, saveReply } from "@/utils/redis/reply";
import { getAiUser } from "@/utils/user/get";

export const generateNudgeReplyAction = withActionInstrumentation(
  "generateNudgeReply",
  async (unsafeData: GenerateReplySchema) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not authenticated" };

    const user = await getAiUser({ id: session.user.id });

    if (!user) return { error: "User not found" };

    const { data, error } = generateReplySchema.safeParse(unsafeData);
    if (error) return { error: error.message };

    const lastMessage = data.messages.at(-1);

    if (!lastMessage) return { error: "No message provided" };

    const reply = await getReply({
      userId: user.id,
      messageId: lastMessage.id,
    });

    if (reply) return { text: reply };

    const messages = data.messages.map((msg) => ({
      ...msg,
      date: new Date(msg.date),
      content: emailToContent({
        textPlain: msg.textPlain,
        textHtml: msg.textHtml,
        snippet: "",
      }),
    }));

    const text = await aiGenerateNudge({ messages, user });
    await saveReply({
      userId: user.id,
      messageId: lastMessage.id,
      reply: text,
    });

    return { text };
  },
);
