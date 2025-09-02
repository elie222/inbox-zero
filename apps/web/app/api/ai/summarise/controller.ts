import { chatCompletionStream } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { expire } from "@/utils/redis";
import { saveSummary } from "@/utils/redis/summary";

export async function summarise({
  text,
  userEmail,
  userAi,
}: {
  text: string;
  userEmail: string;
  userAi: EmailAccountWithAI;
}) {
  const system = `You are an email assistant. You summarise emails.
  Summarise each email in a short ~5 word sentence.
  If you need to summarise a longer email, you can use bullet points. Each bullet should be ~5 words.`;

  const prompt = `Summarise this:\n${text}`;

  const response = await chatCompletionStream({
    userAi: userAi.user,
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    userEmail,
    usageLabel: "Summarise",
    onFinish: async (result) => {
      await saveSummary(prompt, result.text);
      await expire(prompt, 60 * 60 * 24);
    },
  });

  return response;
}

// alternative prompt:
// You are an email assistant. You summarise emails.
// Summarise as bullet points.
// Aim for max 5 bullet points. But even one line may be enough to summarise it.
// Keep bullets short. ~5 words per bullet.
// Skip any mention of sponsorships.
