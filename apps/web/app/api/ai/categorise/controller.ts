import { z } from "zod";
import { openai } from "@/utils/openai";
import { AI_MODEL } from "@/utils/config";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";

export const categoriseBody = z.object({
  subject: z.string(),
  content: z.string(),
});
export type CategoriseBody = z.infer<typeof categoriseBody>;
export type CategoriseResponse = Awaited<ReturnType<typeof categorise>>;

export async function categorise(body: CategoriseBody) {
  const response = await openai.createChatCompletion({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: "You are an assistant that helps categorise emails.",
      },
      {
        role: "user",
        content: `Please categorise this email.
Return a JSON object with a "category" and "confidence" fields. Confidence is a number between 0 and 1.

Categories to choose from with an explanation of each category:
NEWSLETTER - newsletters
MARKETING - marketing emails
RECEIPT - a receipt or invoice for payments I've made
EVENT - calendar or event invites
TRAVEL - travel itineraries and confirmations
QUESTION - someone asks me a question
COLD_EMAIL - someone I don't know emails me to sell me something
SOCIAL_MEDIA - notifications from social media
LEGAL_UPDATE - updates about changes to terms of service or privacy policy
OTHER - anything else

An example response would be:
{
  "category": "NEWSLETTER",
  "confidence": 0.8
}

##
Email:

Subject: ${body.subject}

Body: ${body.content}`,
      },
    ],
  });
  const json: ChatCompletionResponse | ChatCompletionError =
    await response.json();

  const message = isChatCompletionError(json)
    ? "error"
    : json?.choices?.[0]?.message?.content;

  return { message };
}
