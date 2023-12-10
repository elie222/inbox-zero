import { z } from "zod";
import { parseJSON } from "@/utils/json";
import { UserAIFields, getOpenAI } from "@/utils/openai";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { getCategory, saveCategory } from "@/utils/redis/category";
import { CategoriseBody } from "@/app/api/ai/categorise/validation";
import { truncate } from "@/utils/mail";

export type CategoriseResponse = Awaited<ReturnType<typeof categorise>>;

const aiResponseSchema = z.object({
  requiresMoreInformation: z.boolean(),
  category: z
    .enum([
      "NEWSLETTER",
      "PROMOTIONAL",
      "RECEIPT",
      "ALERT",
      "NOTIFICATION",
      "FORUM",
      "EVENT",
      "TRAVEL",
      "QUESTION",
      "SUPPORT",
      "COLD_EMAIL",
      "SOCIAL_MEDIA",
      "LEGAL_UPDATE",
      "OTHER",
    ])
    .optional(),
});

async function aiCategorise(
  body: CategoriseBody & { content: string } & UserAIFields,
  expanded: boolean,
) {
  const message = `Categorize this email.
Return a JSON object with a "category" and "requiresMoreInformation" field.

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

We only provide you with a snippet of the email. If you need more information, set "requiresMoreInformation" to true and we will provide you with the full email to better categorize it.

An example response would be:
{
  "category": "NEWSLETTER",
  "requiresMoreInformation": false
}

If the sender domain includes Beehiiv or Substack it probably is a newsletter.

The email:

###
From: ${body.from}
Subject: ${body.subject}
Unsubscribe link: ${body.unsubscribeLink || "Not found"}
Has emailed us before: ${body.hasPreviousEmail ? "yes" : "no"}

Content:
${expanded ? truncate(body.content, 2000) : body.snippet}
###
`;

  const response = await getOpenAI(body.openAIApiKey).chat.completions.create({
    model: body.aiModel || DEFAULT_AI_MODEL,
    response_format: { type: "json_object" },
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
  options: { email: string },
) {
  // 1. check redis cache
  const existingCategory = await getCategory({
    email: options.email,
    threadId: body.threadId,
  });
  if (existingCategory) return existingCategory;
  // 2. ai categorise
  let category = await aiCategorise(body, false);
  if (category?.requiresMoreInformation) {
    console.log("Not enough information, expanding email and trying again");
    category = await aiCategorise(body, true);
  }

  if (!category?.category) return;
  // 3. save category
  await saveCategory({
    email: options.email,
    threadId: body.threadId,
    category: { category: category.category },
  });
  return category;
}
