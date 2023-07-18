import "server-only";
import { z } from "zod";
import { openai } from "@/app/api/ai/openai";
import { generalPrompt } from "@/utils/config";
import { getPlan, planSchema, savePlan } from "@/utils/redis/plan";
import { saveUsage } from "@/utils/redis/usage";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { getUserLabels } from "@/utils/label";
import { gmail_v1 } from "googleapis";

export const planBody = z.object({ id: z.string(), message: z.string() });
export type PlanBody = z.infer<typeof planBody>;
export type PlanResponse = Awaited<ReturnType<typeof plan>>;

async function calculatePlan(
  message: string,
  labels: { name: string; description?: string | null }[]
) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that helps people get to inbox zero quickly by responding, archiving and labelling emails on the user's behalf.
The user will send email messages and it is your job to return the category of the email.
You will always return valid JSON as a response.
The JSON should contain the following fields:

action: "archive", "label", "respond"
label?: ${labels
          .map(
            (l) => `"${l.name}"${l.description ? ` - ${l.description}` : ""}`
          )
          .join(", \n")}
category: "spam", "promotions", "social", "requires_response", "requires_action", "receipts", "newsletter", "app_update", "terms_and_conditions_update"
response ?: string

If you have decided to respond to the email, you must include a "response" field with the response you want to send.Otherwise the "response" field must be omitted.
If you have decided to label the email, you must include a "label" field with the label.Otherwise the "label" field must be omitted.

An example response to label an email as a newsletter is:
          {
            "action": "label",
            "category": "CATEGORY",
            "label": "LABEL"
          }
            `,
      },
      {
        role: "user",
        content: `${generalPrompt}`,
      },
      {
        role: "user",
        content: `
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.

The email: \n\n###\n\n${message.substring(0, 3000)}
        `,
      },
    ],
  });
  const json: ChatCompletionResponse | ChatCompletionError =
    await response.json();

  return json;
}

export async function plan(
  body: PlanBody,
  user: { id: string; email: string },
  gmail: gmail_v1.Gmail
) {
  // check cache
  const data = await getPlan({ email: user.email, threadId: body.id });
  if (data) return { plan: data };

  const labels = await getUserLabels(user.id, gmail);

  let json = await calculatePlan(body.message, labels || []);

  if (isChatCompletionError(json)) return { plan: undefined };

  const planString: string = json?.choices?.[0]?.message?.content;

  if (!planString) {
    console.error("plan string undefined");
    console.error("length", body.message.length);
    console.error("json", json);
  }

  const planJson = planSchema.parse(JSON.parse(planString));

  // cache result
  await savePlan({
    email: user.email,
    threadId: body.id,
    plan: planJson,
  });

  await saveUsage({
    email: user.email,
    tokensUsed: json.usage.total_tokens,
  });

  return { plan: planJson };
}
