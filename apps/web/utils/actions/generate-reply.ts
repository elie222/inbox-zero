"use server";

import { generateReplySchema } from "@/utils/actions/generate-reply.validation";
import { aiGenerateNudge } from "@/utils/ai/reply/generate-nudge";
import { emailToContent } from "@/utils/mail";
import { getReply, saveReply } from "@/utils/redis/reply";
import { actionClient } from "@/utils/actions/safe-action";

export const generateNudgeReplyAction = actionClient
  .metadata({ name: "generateNudgeReply" })
  .schema(generateReplySchema)
  .action(
    async ({
      ctx: { email, emailAccount },
      parsedInput: { messages: inputMessages },
    }) => {
      if (!emailAccount) return { error: "User not found" };

      const lastMessage = inputMessages.at(-1);

      if (!lastMessage) return { error: "No message provided" };

      const reply = await getReply({
        email,
        messageId: lastMessage.id,
      });

      if (reply) return { text: reply };

      const messages = inputMessages.map((msg) => ({
        ...msg,
        date: new Date(msg.date),
        content: emailToContent({
          textPlain: msg.textPlain,
          textHtml: msg.textHtml,
          snippet: "",
        }),
      }));

      const text = await aiGenerateNudge({ messages, user: emailAccount });
      await saveReply({
        email,
        messageId: lastMessage.id,
        reply: text,
      });

      return { text };
    },
  );
