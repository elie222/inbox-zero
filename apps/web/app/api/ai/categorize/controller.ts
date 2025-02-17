import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import { getCategory, saveCategory } from "@/utils/redis/category";
import { truncate } from "@/utils/string";

// No longer in use

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

async function aiCategorize(
  body: {
    threadId: string;
    from: string;
    subject: string;
    content: string;
    snippet: string;
    unsubscribeLink?: string;
    hasPreviousEmail: boolean;
  } & UserAIFields,
  expanded: boolean,
  userEmail: string,
) {
  const system = "You are an assistant that helps categorize emails.";

  const prompt = `Categorize this email.
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

  const response = await chatCompletionObject({
    userAi: body,
    system,
    prompt,
    schema: aiResponseSchema,
    userEmail,
    usageLabel: "Categorize",
  });

  return response;
}

export async function categorize(
  body: {
    threadId: string;
    from: string;
    subject: string;
    content: string;
    snippet: string;
    unsubscribeLink?: string;
    hasPreviousEmail: boolean;
  } & UserAIFields,
  options: { email: string },
): Promise<{ category: string } | undefined> {
  // 1. check redis cache
  const existingCategory = await getCategory({
    email: options.email,
    threadId: body.threadId,
  });
  if (existingCategory) return existingCategory;
  // 2. ai categorize
  let category = await aiCategorize(body, false, options.email);
  if (category.object.requiresMoreInformation) {
    console.log("Not enough information, expanding email and trying again");
    category = await aiCategorize(body, true, options.email);
  }

  if (!category.object.category) return;
  // 3. save category
  await saveCategory({
    email: options.email,
    threadId: body.threadId,
    category: { category: category.object.category },
  });
  return { category: category.object.category };
}
