import { z } from "zod";
import { parseJSON } from "@/utils/json";
import { UserAIFields, getOpenAI } from "@/utils/openai";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { getCategory, saveCategory } from "@/utils/redis/category";
import { CategoriseBody } from "@/app/api/ai/categorise/validation";
import { RunnableFunctionWithParse } from "openai/lib/RunnableFunction";
import { truncate } from "@/utils/mail";

export type CategoriseResponse = Awaited<ReturnType<typeof categorise>>;

const aiResponseSchema = z.object({ category: z.string() });

const categorizeFunctionSchema = z.object({
  category: z.enum([
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
  ]).describe(`The email category:

* NEWSLETTER - emails that contain long-form articles, thought leadership, insights, or educational resources.
* PROMOTIONAL - marketing or promotional emails to get users to engage with a product or service
* RECEIPT - a receipt or invoice for payments I've made
* ALERT - an alert or notification of error from a service I use
* NOTIFICATION - updates regarding user activity, responses, form submissions, user interactions, or any other user-triggered events
* FORUM - a message from someone on a forum, community, or discussion board
* EVENT - calendar or event invites
* TRAVEL - travel itineraries and confirmations
* QUESTION - someone asks me a question
* SUPPORT - support requests
* COLD_EMAIL - someone I don't know emails me to sell me something
* SOCIAL_MEDIA - social media notifications
* LEGAL_UPDATE - updates about changes to terms of service or privacy policy
* OTHER - anything else
  `),
});

export function getFunctions(options: { expandedEmail: string }) {
  const functions: Record<string, RunnableFunctionWithParse<any>> = {
    // We pass in a truncated snippet initially to try reduce tokens used
    expandEmail: {
      name: "expandEmail",
      function: async (_args: {}) => {
        return { email: options.expandedEmail };
      },
      description: "Expand the email if you do not have enough context.",
      parse: (args: string) => z.object({}).parse(JSON.parse(args)),
      // TODO use zodToJsonSchema
      parameters: { type: "object", properties: {} },
    },
    categorizeEmail: {
      name: "categorizeEmail",
      function: async (_args: z.infer<typeof categorizeFunctionSchema>) => {
        // TODO return category as result?

        // We grab this result from finalFunctionCall instead.
        return { success: true };
      },
      description: "Categorize the email.",
      parse: (args: string) => categorizeFunctionSchema.parse(JSON.parse(args)),
      // TODO use zodToJsonSchema
      parameters: {
        type: "object",
        properties: {},
      },
    },
  };

  return functions;
}

async function aiCategorise(body: CategoriseBody & UserAIFields) {
  const message = `Categorize this email.

A mistake you often make is categorizing an email as NEWSLETTER when it is actually PROMOTIONAL or NOTIFICATION. Do not do this. If it is not a long-form article it is not a newsletter.

###
The email:

From: ${body.from}
Subject: ${body.subject}
Unsubscribe link: ${body.unsubscribeLink || "Not found"}
Has emailed us before: ${body.hasPreviousEmail ? "yes" : "no"}

Body:
${body.snippet}
###
`;

  const runner = getOpenAI(
    body.openAIApiKey,
  ).beta.chat.completions.runFunctions({
    model: body.aiModel || DEFAULT_AI_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an assistant that categorizes emails.`,
      },
      { role: "user", content: message },
    ],
    functions: Object.values(
      getFunctions({ expandedEmail: truncate(body.content, 1000) }),
    ),
    temperature: 0,
    frequency_penalty: 0,
  });

  const content = (await runner.finalFunctionCall())?.arguments?.[0];

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
  body: CategoriseBody & UserAIFields,
  options: { email: string },
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
