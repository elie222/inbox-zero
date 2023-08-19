import { z } from "zod";
import json5 from "json5";
import { openai } from "@/utils/openai";
import { AI_MODEL } from "@/utils/config";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { getCategory, saveCategory } from "@/utils/redis/category";

export const categoriseBody = z.object({
  threadId: z.string(),
  subject: z.string(),
  content: z.string(),
});
export type CategoriseBody = z.infer<typeof categoriseBody>;
export type CategoriseResponse = Awaited<ReturnType<typeof categorise>>;

const responseSchema = z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1),
});

export async function aiCategorise(body: CategoriseBody) {
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

Body: ${body.content.slice(0, 1000)}`,
      },
    ],
  });
  const json: ChatCompletionResponse | ChatCompletionError =
    await response.json();

  if (isChatCompletionError(json)) {
    console.error(json);
    return;
  }

  const content = json.choices[0].message.content;

  try {
    const res = json5.parse(content);

    return responseSchema.parse(res);
  } catch (error) {
    console.error("Error parsing json:", content);
    return;
  }
}

export async function categorise(
  body: CategoriseBody,
  options: { email: string }
) {
  // 1. check redis cache
  const existingCategory = await getCategory({
    email: options.email,
    threadId: body.threadId,
  });

  if (existingCategory) return existingCategory;

  // 2. ai categorise
  const category = await aiCategorise(body);

  if (!category) return;

  // 3. save category
  await saveCategory({
    email: options.email,
    threadId: body.threadId,
    category,
  });

  return category;
}
