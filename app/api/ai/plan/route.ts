import { z } from "zod";
import { NextResponse } from "next/server";
import { openai } from "@/app/api/ai/openai";
import { generalPrompt } from "@/utils/config";
import { redis } from "@/utils/redis";
import { withRetry } from "@/utils/retry";

const planBody = z.object({ id: z.string(), message: z.string() });
export type PlanBody = z.infer<typeof planBody>;
export type PlanResponse = Awaited<ReturnType<typeof plan>>;

const planSchema = z.object({
  category: z.string(),
  plan: z.string(),
  response: z.string().nullish(),
  label: z.string().nullish(),
});
export type Plan = z.infer<typeof planSchema>;

export const runtime = "edge";

async function getPlan(message: string) {
  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [{
      role: 'system',
      content: `You are an AI assistant that helps people get to inbox zero quickly by responding, archiving and labelling emails on the user's behalf.
The user will send email messages and it is your job to return the category of the email.
You will always return valid JSON as a response.
The JSON should contain the following fields:

category: string
plan: string
response?: string
label?: string

Categories to use are: "spam", "promotions", "social", "requires_response", "requires_action", "receipts", "newsletter", "app_update", "terms_and_conditions_update".
Plans to use are: "archive", "label", "respond".
Labels to use are: "newsletter", "receipts".

If you have decided to respond to the email, you must include a "response" field with the response you want to send. Otherwise the "response" field must be omitted.
If you have decided to label the email, you must include a "label" field with the label. Otherwise the "label" field must be omitted.
`,
    }, {
      role: 'user',
      content: `${generalPrompt}`,
    }, {
      role: 'user',
      content: `
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.

The email in question is:\n\n###\n\n${message}
`
    }],
  });
  const json = await response.json();
  return json;
}

const plan = withRetry(async function plan(body: PlanBody) {
  // TODO secure this endpoint so people can't just ask for any id (and see the response from gpt)

  // check cache
  const cacheKey = `plan:${body.id}`
  const data = await redis.get<Plan>(cacheKey);
  if (data) return { plan: data };

  let json = await getPlan(body.message);
  const planString: string = json?.choices?.[0]?.message?.content;
  const planJson = planSchema.parse(planString);

  // return cached result
  await redis.set(cacheKey, planJson);

  return { plan: planJson };
});

export async function POST(request: Request) {
  const json = await request.json();
  const body = planBody.parse(json);
  const res = await plan(body);

  return NextResponse.json(res);
}
