import { chatCompletionStream } from "@/utils/llms";
import { saveAiUsageStream } from "@/utils/usage";

export async function summarise(
  text: string,
  {
    userEmail,
    onFinal,
  }: {
    userEmail: string;
    onFinal?: (completion: string) => Promise<void>;
  },
) {
  const model = "gpt-3.5-turbo-0125" as const;
  const messages = [
    {
      role: "system" as const,
      content: `You are an email assistant. You summarise emails.
  Summarise each email in a short sentence ~5 word sentence.
  If you need to summarise a longer email, you can bullet points. Each bullet should be ~5 words.`,
    },
    {
      role: "user" as const,
      content: `Summarise this:
  ${text}`,
    },
  ];

  const response = await chatCompletionStream("openai", model, null, messages);

  const stream = await saveAiUsageStream({
    response,
    provider: "openai",
    model,
    userEmail,
    messages,
    label: "Summarise",
    onFinal,
  });

  return stream;
}

// alternative prompt:
// You are an email assistant. You summarise emails.
// Summarise as bullet points.
// Aim for max 5 bullet points. But even one line may be enough to summarise it.
// Keep bullets short. ~5 words per bullet.
// Skip any mention of sponsorships.
