import { z } from "zod";
import { parseJSON } from "@/utils/json";
import { UserAIFields, getOpenAI } from "@/utils/openai";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { getCategory, saveCategory } from "@/utils/redis/category";
import { CategoriseBody } from "@/app/api/ai/categorise/validation";

export type CategoriseResponse = Awaited<ReturnType<typeof categorise>>;

const aiResponseSchema = z.object({ category: z.string() });

async function aiCategorise(
  body: CategoriseBody & { content: string } & UserAIFields
) {
  const message = `Categorize this email.
Return a JSON object with a "category" field.

These are the categories to choose from, with an explanation of each one:
NEWSLETTER - emails that contain long-form articles, thought leadership, insights, or educational resources.
PROMOTIONAL - marketing or promotional emails to get users to engage with a product or service
RECEIPT - a receipt or invoice for payments I've made
ALERT - an alert or notification of error from a service I use
NOTIFICATION - updates regarding user activity, responses, form submissions, user interactions, or any other user-triggered events
FORUM - a message from someone on a forum, community, or discussion board
EVENT - calendar or event invites
TRAVEL - travel itineraries and confirmations
QUESTION - someone asks me a question
SUPPORT - support requests
COLD_EMAIL - someone I don't know emails me to sell me something
SOCIAL_MEDIA - social media notifications
LEGAL_UPDATE - updates about changes to terms of service or privacy policy
OTHER - anything else

An example response would be:
{
  "category": "NEWSLETTER"
}

A mistake you often make is categorizing an email as NEWSLETTER when it is actually PROMOTIONAL or NOTIFICATION. Do not do this. If it is not a long-form article it is not a newsletter.

##
The email:

From: ${body.from}
Subject: ${body.subject}

${body.content}
`;

  const response = await getOpenAI(body.openAIApiKey).chat.completions.create({
    model: body.aiModel || DEFAULT_AI_MODEL,
    messages: [
      {
        role: "system",
        content: "You are an assistant that helps categorize emails.",
      },
      {
        role: "user",
        content: message,
      },
    ],
  });

  const content = response.choices[0].message.content;

  if (!content) return;

  try {
    const res = parseJSON(content);

    return aiResponseSchema.parse(res);
  } catch (error) {
    console.error("Error parsing json:", content);
    return;
  }
}

export async function categorise(
  body: CategoriseBody & { content: string } & UserAIFields,
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
  console.log("category:", category);

  if (!category) return;

  // 3. save category
  await saveCategory({
    email: options.email,
    threadId: body.threadId,
    category,
  });

  return category;
}
